use aws_sdk_s3::Client;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::types::{CompletedMultipartUpload, CompletedPart};
use anyhow::Result;
use sha2::{Sha256, Digest};
use tokio::io::{AsyncRead, AsyncReadExt};

pub struct StorageService {
    client: Client,
    bucket: String,
}

pub struct UploadResult {
    pub hash: String,
    pub size: i64,
    pub s3_key: String,
}

impl StorageService {
    pub fn new(client: Client, bucket: String) -> Self {
        Self { client, bucket }
    }

    pub async fn upload_file(&self, key: &str, data: Vec<u8>) -> Result<()> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(data))
            .send()
            .await?;
        Ok(())
    }

    /// Uploads a stream to S3 while calculating its SHA256 hash on the fly.
    /// This is highly memory efficient and avoids local disk I/O.
    pub async fn upload_stream_with_hash<R>(
        &self,
        key: &str,
        mut reader: R,
    ) -> Result<UploadResult> 
    where 
        R: AsyncRead + Unpin + Send,
    {
        let multipart_upload_res = self.client
            .create_multipart_upload()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;

        let upload_id = multipart_upload_res.upload_id().ok_or_else(|| anyhow::anyhow!("No upload ID"))?;
        let mut chunk_index = 1;
        let mut completed_parts = Vec::new();
        let mut hasher = Sha256::new();
        let mut total_size = 0;
        
        // 10MB chunks are a good balance for 50k concurrency vs memory usage
        let chunk_size = 10 * 1024 * 1024; 
        let mut buffer = vec![0u8; chunk_size];

        loop {
            let mut n = 0;
            while n < chunk_size {
                let read = reader.read(&mut buffer[n..]).await?;
                if read == 0 {
                    break;
                }
                hasher.update(&buffer[n..n+read]);
                n += read;
            }

            if n == 0 {
                break;
            }

            total_size += n as i64;
            let body = ByteStream::from(buffer[..n].to_vec());
            let upload_part_res = self.client
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
                    .build()
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

        let hash = hex::encode(hasher.finalize());
        
        Ok(UploadResult {
            hash,
            size: total_size,
            s3_key: key.to_string(),
        })
    }

    pub async fn copy_object(&self, source_key: &str, dest_key: &str) -> Result<()> {
        self.client
            .copy_object()
            .bucket(&self.bucket)
            .copy_source(format!("{}/{}", self.bucket, source_key))
            .key(dest_key)
            .send()
            .await?;
        Ok(())
    }

    pub async fn delete_file(&self, key: &str) -> Result<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;
        Ok(())
    }

    pub async fn file_exists(&self, key: &str) -> Result<bool> {
        let res = self.client
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

    pub async fn get_download_url(&self, _key: &str) -> Result<String> {
        Ok(format!("{}/{}", self.bucket, _key))
    }
}
