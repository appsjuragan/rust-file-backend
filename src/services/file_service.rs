use crate::api::error::AppError;
use crate::config::SecurityConfig;
use crate::entities::{prelude::*, *};
use crate::services::metadata::MetadataService;
use crate::services::scanner::{ScanResult, VirusScanner};
use crate::services::storage::StorageService;
use crate::utils::validation::{validate_file_size, validate_upload};
use chrono::{Duration, Utc};
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use std::sync::Arc;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio_util::io::StreamReader;
use uuid::Uuid;

pub struct FileService {
    db: DatabaseConnection,
    storage: Arc<dyn StorageService>,
    scanner: Arc<dyn VirusScanner>,
    config: SecurityConfig,
}

pub struct StagedFile {
    pub key: String,
    pub hash: String,
    pub size: i64,
    pub s3_key: String,
}

impl FileService {
    pub fn new(
        db: DatabaseConnection,
        storage: Arc<dyn StorageService>,
        scanner: Arc<dyn VirusScanner>,
        config: SecurityConfig,
    ) -> Self {
        Self {
            db,
            storage,
            scanner,
            config,
        }
    }

    pub async fn upload_to_staging<'a>(
        &self,
        filename: &str,
        content_type: Option<&str>,
        mut reader: impl AsyncRead + Unpin + Send + 'a,
    ) -> Result<StagedFile, AppError> {
        // 1. Peek into stream for magic bytes
        let mut header_buffer = [0u8; 1024];
        let n = reader
            .read(&mut header_buffer)
            .await
            .map_err(|e| AppError::Internal(format!("Read error: {}", e)))?;
        let header = &header_buffer[..n];

        // 2. Early Validation
        validate_upload(filename, content_type, 0, header)
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        // Reconstruct stream
        let header_cursor = std::io::Cursor::new(header.to_vec());
        let chained_reader = tokio::io::AsyncReadExt::chain(header_cursor, reader);

        // 3. Upload to Staging
        let staging_key = format!("staging/{}", Uuid::new_v4());
        let res = self
            .storage
            .upload_stream_with_hash(&staging_key, Box::new(chained_reader))
            .await
            .map_err(|e| {
                tracing::error!("S3 staging upload failed: {:?}", e);
                AppError::Internal(e.to_string())
            })?;

        // 4. Post-upload Size Validation
        if let Err(e) = validate_file_size(res.size as usize) {
            let _ = self.storage.delete_file(&staging_key).await;
            return Err(AppError::PayloadTooLarge(e.to_string()));
        }

        Ok(StagedFile {
            key: staging_key,
            hash: res.hash,
            size: res.size,
            s3_key: res.s3_key,
        })
    }

    pub async fn process_upload(
        &self,
        staged: StagedFile,
        filename: String,
        user_id: String,
        parent_id: Option<String>,
        expiration_hours: Option<i64>,
    ) -> Result<(String, Option<chrono::DateTime<Utc>>), AppError> {
        // Check for deduplication
        let existing_storage_file = StorageFiles::find()
            .filter(storage_files::Column::Hash.eq(&staged.hash))
            .one(&self.db)
            .await?;

        let mut analysis_result = None;
        let storage_file_id = if let Some(sf) = existing_storage_file {
            // Deduplication hit! Increment ref_count
            let mut active: storage_files::ActiveModel = sf.clone().into();
            active.ref_count = Set(sf.ref_count + 1);
            active.update(&self.db).await?;

            let _ = self.storage.delete_file(&staged.s3_key).await;
            sf.id
        } else {
            // New unique file!
            
            // 1. Download file from staging for processing
            let stream = self
                .storage
                .get_object_stream(&staged.s3_key)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to open for processing: {}", e)))?;

            let bytes = stream.body
                .collect()
                .await
                .map(|b| b.into_bytes())
                .map_err(|e| AppError::Internal(e.to_string()))?;

            // 2. Virus Scanning
            if self.config.enable_virus_scan {
                let reader = Box::pin(std::io::Cursor::new(bytes.clone()));
                match self.scanner.scan(reader).await {
                    Ok(ScanResult::Clean) => {
                        tracing::info!("Virus scan passed for {}", staged.hash);
                    }
                    Ok(ScanResult::Infected { threat_name }) => {
                        tracing::warn!("Virus detected in {}: {}", staged.hash, threat_name);
                        let _ = self.storage.delete_file(&staged.s3_key).await;
                        return Err(AppError::BadRequest(format!(
                            "File rejected: Virus detected ({})",
                            threat_name
                        )));
                    }
                    _ => {
                        tracing::error!("Virus scan failed or errored");
                        let _ = self.storage.delete_file(&staged.s3_key).await;
                        return Err(AppError::Internal("Scan error".to_string()));
                    }
                }
            }

            // 3. Metadata Analysis
            let analysis = MetadataService::analyze(&bytes, &filename);
            let mime_type = analysis.metadata["mime_type"]
                .as_str()
                .unwrap_or("application/octet-stream")
                .to_string();
            analysis_result = Some(analysis);

            let id = Uuid::new_v4().to_string();
            let permanent_key = format!("{}/{}", staged.hash, filename);

            self.storage
                .copy_object(&staged.s3_key, &permanent_key)
                .await
                .map_err(|e| AppError::Internal(format!("S3 move failed: {}", e)))?;

            let _ = self.storage.delete_file(&staged.s3_key).await;

            #[allow(clippy::needless_update)]
            let new_storage_file = storage_files::ActiveModel {
                id: Set(id.clone()),
                hash: Set(staged.hash),
                s3_key: Set(permanent_key),
                size: Set(staged.size),
                ref_count: Set(1),
                mime_type: Set(Some(mime_type)),
                scan_status: Set(Some(
                    if self.config.enable_virus_scan {
                        "clean"
                    } else {
                        "unchecked"
                    }
                    .to_string(),
                )),
                scanned_at: Set(Some(Utc::now())),
                ..Default::default()
            };

            new_storage_file.insert(&self.db).await?;

            id
        };

        let user_file_id = Uuid::new_v4().to_string();
        let expires_at = expiration_hours.map(|h| Utc::now() + Duration::hours(h));

        #[allow(clippy::needless_update)]
        let new_user_file = user_files::ActiveModel {
            id: Set(user_file_id.clone()),
            user_id: Set(user_id),
            storage_file_id: Set(Some(storage_file_id.clone())),
            filename: Set(filename.clone()),
            expires_at: Set(expires_at),
            parent_id: Set(parent_id),
            is_folder: Set(false),
            ..Default::default()
        };

        new_user_file.insert(&self.db).await.map_err(|e| {
            tracing::error!("Failed to insert user_file: {}", e);
            AppError::Internal(e.to_string())
        })?;

        // Save Metadata and Tags
        if let Err(e) = self
            .save_metadata_and_tags(&storage_file_id, &user_file_id, analysis_result)
            .await
        {
            tracing::error!("Failed to save metadata and tags: {}", e);
        }

        Ok((user_file_id, expires_at))
    }

    async fn save_metadata_and_tags(
        &self,
        storage_file_id: &str,
        user_file_id: &str,
        analysis: Option<crate::services::metadata::MetadataResult>,
    ) -> Result<(), anyhow::Error> {
        let tags_to_link = if let Some(a) = analysis {
            tracing::debug!(
                "Saving new metadata for storage_file_id: {}",
                storage_file_id
            );
            let existing_meta = FileMetadata::find()
                .filter(file_metadata::Column::StorageFileId.eq(storage_file_id))
                .one(&self.db)
                .await?;

            if existing_meta.is_none() {
                let mut metadata_with_tags = a.metadata.clone();
                metadata_with_tags["auto_tags"] = serde_json::json!(a.suggested_tags);

                let meta_model = file_metadata::ActiveModel {
                    id: Set(Uuid::new_v4().to_string()),
                    storage_file_id: Set(storage_file_id.to_string()),
                    category: Set(a.category.clone()),
                    metadata: Set(metadata_with_tags),

                };
                meta_model.insert(&self.db).await?;
            }
            a.suggested_tags
        } else {
            tracing::debug!(
                "Dedup case, fetching metadata for storage_file_id: {}",
                storage_file_id
            );
            let existing_meta = FileMetadata::find()
                .filter(file_metadata::Column::StorageFileId.eq(storage_file_id))
                .one(&self.db)
                .await?;

            if let Some(meta) = existing_meta {
                meta.metadata["auto_tags"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        };

        for tag_name in tags_to_link {
            let tag = match Tags::find()
                .filter(tags::Column::Name.eq(&tag_name))
                .one(&self.db)
                .await?
            {
                Some(t) => t,
                None => {
                    let new_tag = tags::ActiveModel {
                        id: Set(Uuid::new_v4().to_string()),
                        name: Set(tag_name.clone()),

                    };
                    new_tag.insert(&self.db).await?
                }
            };

            let link = file_tags::ActiveModel {
                user_file_id: Set(user_file_id.to_string()),
                tag_id: Set(tag.id),

            };
            let _ = link.insert(&self.db).await;
        }

        Ok(())
    }
}
