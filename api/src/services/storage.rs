use anyhow::Result;
use async_trait::async_trait;
use aws_sdk_s3::Client;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{CompletedMultipartUpload, CompletedPart};
use xxhash_rust::xxh3::Xxh3;
use tokio::io::{AsyncRead, AsyncReadExt};

pub struct UploadResult {
    pub hash: String,
    pub size: i64,
    pub s3_key: String,
}

pub struct FileMetadata {
    pub last_modified: Option<chrono::DateTime<chrono::Utc>>,
    pub size: i64,
}

#[async_trait]
pub trait StorageService: Send + Sync {
    async fn upload_file(&self, key: &str, data: Vec<u8>) -> Result<()>;
    async fn upload_stream_with_hash<'a>(
        &self,
        key: &str,
        reader: Box<dyn AsyncRead + Unpin + Send + 'a>,
    ) -> Result<UploadResult>;
    async fn copy_object(&self, source_key: &str, dest_key: &str) -> Result<()>;
    async fn delete_file(&self, key: &str) -> Result<()>;
    async fn file_exists(&self, key: &str) -> Result<bool>;
    async fn get_download_url(&self, key: &str) -> Result<String>;
    async fn get_object_stream(
        &self,
        key: &str,
    ) -> Result<aws_sdk_s3::operation::get_object::GetObjectOutput>;
    async fn get_object_range(
        &self,
        key: &str,
        range: &str,
    ) -> Result<aws_sdk_s3::operation::get_object::GetObjectOutput>;
    async fn get_file(&self, key: &str) -> Result<Vec<u8>>;
    async fn list_objects(&self, prefix: &str) -> Result<Vec<String>>;
    async fn get_object_metadata(&self, key: &str) -> Result<FileMetadata>;
}

pub struct S3StorageService {
    client: Client,
    bucket: String,
}

impl S3StorageService {
    pub fn new(client: Client, bucket: String) -> Self {
        Self { client, bucket }
    }
}

#[async_trait]
impl StorageService for S3StorageService {
    async fn upload_file(&self, key: &str, data: Vec<u8>) -> Result<()> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(data))
            .send()
            .await?;
        Ok(())
    }

    async fn upload_stream_with_hash<'a>(
        &self,
        key: &str,
        mut reader: Box<dyn AsyncRead + Unpin + Send + 'a>,
    ) -> Result<UploadResult> {
        let multipart_upload_res = self
            .client
            .create_multipart_upload()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;

        let upload_id = multipart_upload_res
            .upload_id()
            .ok_or_else(|| anyhow::anyhow!("No upload ID"))?;
        let mut chunk_index = 1;
        let mut completed_parts = Vec::new();
        let mut hasher = Xxh3::new();
        let mut total_size = 0;

        let chunk_size = 10 * 1024 * 1024;
        let mut buffer = vec![0u8; chunk_size];

        loop {
            let mut n = 0;
            while n < chunk_size {
                let read = reader.read(&mut buffer[n..]).await?;
                if read == 0 {
                    break;
                }
                hasher.update(&buffer[n..n + read]);
                n += read;
            }

            if n == 0 {
                break;
            }

            total_size += n as i64;
            let body = ByteStream::from(buffer[..n].to_vec());
            let upload_part_res = self
                .client
                .upload_part()
                .bucket(&self.bucket)
                .key(key)
                .upload_id(upload_id)
                .body(body)
                .part_number(chunk_index)
                .send()
                .await?;

            completed_parts.push(
                CompletedPart::builder()
                    .e_tag(upload_part_res.e_tag().unwrap_or_default())
                    .part_number(chunk_index)
                    .build(),
            );

            chunk_index += 1;
        }

        let completed_multipart_upload = CompletedMultipartUpload::builder()
            .set_parts(Some(completed_parts))
            .build();

        self.client
            .complete_multipart_upload()
            .bucket(&self.bucket)
            .key(key)
            .upload_id(upload_id)
            .multipart_upload(completed_multipart_upload)
            .send()
            .await?;

        let hash = format!("{:016x}", hasher.digest());

        Ok(UploadResult {
            hash,
            size: total_size,
            s3_key: key.to_string(),
        })
    }

    async fn copy_object(&self, source_key: &str, dest_key: &str) -> Result<()> {
        let res = self
            .client
            .copy_object()
            .bucket(&self.bucket)
            .copy_source(format!("{}/{}", self.bucket, source_key))
            .key(dest_key)
            .send()
            .await;

        if let Err(e) = res {
            tracing::error!(
                "S3 copy_object failed: source={}/{}, dest={}, error={:?}",
                self.bucket,
                source_key,
                dest_key,
                e
            );
            return Err(e.into());
        }
        Ok(())
    }

    async fn delete_file(&self, key: &str) -> Result<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;
        Ok(())
    }

    async fn file_exists(&self, key: &str) -> Result<bool> {
        let res = self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await;

        match res {
            Ok(_) => Ok(true),
            Err(e) => {
                let service_error = e.into_service_error();
                if service_error.is_not_found() {
                    Ok(false)
                } else {
                    Err(anyhow::anyhow!(service_error))
                }
            }
        }
    }

    async fn get_download_url(&self, key: &str) -> Result<String> {
        Ok(format!("{}/{}", self.bucket, key))
    }

    async fn get_object_stream(
        &self,
        key: &str,
    ) -> Result<aws_sdk_s3::operation::get_object::GetObjectOutput> {
        let res = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;
        Ok(res)
    }

    async fn get_object_range(
        &self,
        key: &str,
        range: &str,
    ) -> Result<aws_sdk_s3::operation::get_object::GetObjectOutput> {
        let res = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .range(range)
            .send()
            .await?;
        Ok(res)
    }

    async fn get_file(&self, key: &str) -> Result<Vec<u8>> {
        let res = self.get_object_stream(key).await?;
        let data = res.body.collect().await?.to_vec();
        Ok(data)
    }

    async fn list_objects(&self, prefix: &str) -> Result<Vec<String>> {
        let mut objects = Vec::new();
        let mut continuation_token = None;

        loop {
            let res = self
                .client
                .list_objects_v2()
                .bucket(&self.bucket)
                .prefix(prefix)
                .set_continuation_token(continuation_token)
                .send()
                .await?;

            if let Some(contents) = res.contents {
                for object in contents {
                    if let Some(key) = object.key {
                        objects.push(key);
                    }
                }
            }

            if res.is_truncated.unwrap_or(false) {
                continuation_token = res.next_continuation_token;
            } else {
                break;
            }
        }

        Ok(objects)
    }

    async fn get_object_metadata(&self, key: &str) -> Result<FileMetadata> {
        let res = self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;

        let last_modified = res.last_modified.map(|d| {
            chrono::DateTime::from_timestamp(d.secs(), d.subsec_nanos()).unwrap_or_default()
        });

        Ok(FileMetadata {
            last_modified,
            size: res.content_length.unwrap_or(0),
        })
    }
}
