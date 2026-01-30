use crate::api::error::AppError;
use crate::config::SecurityConfig;
use crate::entities::{prelude::*, *};
use crate::services::metadata::MetadataService;
use crate::services::storage::StorageService;
use crate::utils::validation::validate_upload;
use chrono::{Duration, Utc};
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use std::sync::Arc;
use tokio::io::{AsyncRead, AsyncReadExt};
use uuid::Uuid;

use crate::services::scanner::VirusScanner;
use crate::services::{
    audit::{AuditEventType, AuditService},
    encryption::EncryptionService,
};
use tempfile::NamedTempFile;
use tokio::io::AsyncWriteExt;

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
        validate_upload(filename, content_type, 0, header, self.config.max_file_size)
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        // Reconstruct stream
        let header_cursor = std::io::Cursor::new(header.to_vec());
        let mut chained_reader = tokio::io::AsyncReadExt::chain(header_cursor, reader);

        // 3. Buffer to Temp File and Calculate Hash
        let temp_file = NamedTempFile::new().map_err(|e| AppError::Internal(e.to_string()))?;
        let temp_path = temp_file.path().to_owned();
        let mut temp_file_async = tokio::fs::File::from_std(
            temp_file
                .reopen()
                .map_err(|e| AppError::Internal(e.to_string()))?,
        );

        let mut hasher = blake3::Hasher::new();
        let mut buffer = [0u8; 8192];
        let mut total_size = 0;

        loop {
            let n = chained_reader
                .read(&mut buffer)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
            temp_file_async
                .write_all(&buffer[..n])
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
            total_size += n as i64;

            if total_size > self.config.max_file_size as i64 {
                // Return PayloadTooLarge immediately
                return Err(AppError::PayloadTooLarge(
                    "File size limits exceeded".to_string(),
                ));
            }
        }
        temp_file_async
            .flush()
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // 4. Derive Key and Upload Encrypted
        let hash = hasher.finalize().to_hex().to_string();
        let key = EncryptionService::derive_key_from_hash(&hash);

        // Re-open temp file for reading
        let temp_reader = tokio::fs::File::open(&temp_path)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let encrypted_stream = EncryptionService::encrypt_stream(Box::new(temp_reader), key);
        // Map std::io::Error to crate::api::error::AppError explicitly if needed,
        // but StreamReader expects io::Result items, which encrypt_stream now provides.
        // Pin the stream to satisfy Unpin requirement for StreamReader -> Box<dyn AsyncRead>
        let pinned_stream = Box::pin(encrypted_stream);
        let stream_reader = tokio_util::io::StreamReader::new(pinned_stream);
        // S3 expects AsyncRead. StreamReader implements it but errors are likely distinct.
        // We wrap it in a box. Mapping failure logic is needed if StreamReader::read fails?
        // StreamReader returns io::Result.

        // Convert to Box<dyn AsyncRead + Unpin + Send>
        // StreamReader is Unpin if inner stream is Unpin. `encrypt_stream` yields `Bytes` which is unpin.
        // However, `encrypt_stream` returns `impl Stream`. We might need `Box::pin` depending on types.
        // `encrypt_stream` return type `impl Stream`.

        let staging_key = format!("staging/{}", Uuid::new_v4());
        tracing::info!(
            "Starting Encrypted S3 upload for {} to {}",
            filename,
            staging_key
        );

        let _res = self
            .storage
            .upload_stream_with_hash(&staging_key, Box::new(stream_reader))
            .await
            .map_err(|e| AppError::Internal(format!("Upload failed: {}", e)))?;

        // `res.hash` will be hash of CIPHERTEXT. We ignore it for logic, we use Plaintext Hash.

        Ok(StagedFile {
            key: staging_key.clone(),
            hash,             // Plaintext Hash
            size: total_size, // Plaintext Size
            s3_key: staging_key,
        })
    }

    pub async fn process_upload(
        &self,
        staged: StagedFile,
        filename: String,
        user_id: String,
        parent_id: Option<String>,
        expiration_hours: Option<i64>,
        total_size: Option<u64>,
    ) -> Result<(String, Option<chrono::DateTime<Utc>>), AppError> {
        // Get User for Keys
        let user = Users::find_by_id(&user_id)
            .one(&self.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

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

            // 1. Download/Decrypt file from staging for processing
            let stream = self
                .storage
                .get_object_stream(&staged.s3_key)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to open for processing: {}", e)))?;

            let file_key = EncryptionService::derive_key_from_hash(&staged.hash);
            let body_reader = stream.body.into_async_read();
            let decrypted_stream =
                EncryptionService::decrypt_stream(Box::new(body_reader), file_key);
            let pinned_decrypted_stream = Box::pin(decrypted_stream);
            let mut decrypted_reader = tokio_util::io::StreamReader::new(pinned_decrypted_stream);

            let mut bytes = Vec::new();
            tokio::io::copy(&mut decrypted_reader, &mut bytes)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Failed to decrypt for analysis: {}", e))
                })?;

            // 2. Metadata Analysis
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

            let mut scan_status = if self.config.enable_virus_scan {
                "pending"
            } else {
                "unchecked"
            }
            .to_string();
            let mut scan_result = None;
            let mut scanned_at = None;

            // Immediate scan (On Plaintext Bytes)
            if self.config.enable_virus_scan
                && staged.size < 20 * 1024 * 1024
                && total_size.unwrap_or(0) <= 100 * 1024 * 1024
            {
                tracing::info!("🚀 Starting immediate scan for file: {}", id);
                // We already have `bytes` from decryption above. Use them.
                let cursor = std::io::Cursor::new(bytes);
                match self.scanner.scan(Box::pin(cursor)).await {
                    Ok(crate::services::scanner::ScanResult::Clean) => {
                        tracing::info!("✅ Immediate scan clean: {}", id);
                        scan_status = "clean".to_string();
                        scanned_at = Some(Utc::now());
                    }
                    Ok(crate::services::scanner::ScanResult::Infected { threat_name }) => {
                        tracing::warn!("🚨 Immediate scan infected: {} ({})", id, threat_name);
                        scan_status = "infected".to_string();
                        scan_result = Some(threat_name);
                        scanned_at = Some(Utc::now());
                    }
                    Ok(crate::services::scanner::ScanResult::Error { reason }) => {
                        tracing::error!("❌ Immediate scan error for {}: {}", id, reason);
                    }
                    Err(e) => {
                        tracing::error!("❌ Immediate scan failed for {}: {}", id, e);
                    }
                }
            }

            #[allow(clippy::needless_update)]
            let new_storage_file = storage_files::ActiveModel {
                id: Set(id.clone()),
                hash: Set(staged.hash.clone()),
                s3_key: Set(permanent_key),
                size: Set(staged.size),
                ref_count: Set(1),
                mime_type: Set(Some(mime_type)),
                scan_status: Set(Some(scan_status)),
                scan_result: Set(scan_result),
                scanned_at: Set(scanned_at),
                ..Default::default()
            };

            new_storage_file.insert(&self.db).await?;

            id
        };

        let expires_at = expiration_hours.map(|h| Utc::now() + Duration::hours(h));

        // Generate Wrapped Key for User
        let user_pub_key = user
            .public_key
            .ok_or_else(|| AppError::Internal("User lacks public key".to_string()))?;
        let file_key = EncryptionService::derive_key_from_hash(&staged.hash);
        let wrapped_key = EncryptionService::wrap_key(&file_key, &user_pub_key)
            .map_err(|e| AppError::Internal(format!("Failed to wrap key: {}", e)))?;

        // Check for existing file with same name in the same folder for merging
        let existing_user_file = UserFiles::find()
            .filter(user_files::Column::UserId.eq(&user_id))
            .filter(user_files::Column::Filename.eq(&filename))
            .filter(user_files::Column::ParentId.eq(parent_id.clone()))
            .filter(user_files::Column::IsFolder.eq(false))
            .filter(user_files::Column::DeletedAt.is_null())
            .one(&self.db)
            .await?;

        let user_file_id = if let Some(existing) = existing_user_file {
            // Merge logic: Update existing record to point to new storage file
            let old_storage_file_id = existing.storage_file_id.clone();
            let existing_id = existing.id.clone();

            let mut active: user_files::ActiveModel = existing.into();
            active.storage_file_id = Set(Some(storage_file_id.clone()));
            active.expires_at = Set(expires_at);
            active.file_signature = Set(Some(wrapped_key)); // Update Key
            active.created_at = Set(Some(Utc::now())); // Update timestamp to "latest"
            active.update(&self.db).await.map_err(|e| {
                tracing::error!("Failed to update existing user_file: {}", e);
                AppError::Internal(e.to_string())
            })?;

            // Decrement ref count of old storage file if it's different
            if let Some(old_id) = old_storage_file_id
                && old_id != storage_file_id
            {
                let _ = crate::services::storage_lifecycle::StorageLifecycleService::decrement_ref_count(
                        &self.db,
                        self.storage.as_ref(),
                        &old_id,
                    )
                    .await;
            }
            existing_id
        } else {
            // No existing file, create new one
            let new_id = Uuid::new_v4().to_string();
            #[allow(clippy::needless_update)]
            let new_user_file = user_files::ActiveModel {
                id: Set(new_id.clone()),
                user_id: Set(user_id.clone()),
                storage_file_id: Set(Some(storage_file_id.clone())),
                filename: Set(filename.clone()),
                parent_id: Set(parent_id),
                expires_at: Set(expires_at),
                created_at: Set(Some(Utc::now())),
                is_folder: Set(false),
                file_signature: Set(Some(wrapped_key)), // Set Key
                ..Default::default()
            };

            let _res = new_user_file.insert(&self.db).await.map_err(|e| {
                tracing::error!("Failed to insert user_file: {}", e);
                AppError::Internal(e.to_string())
            })?;

            // Audit Log
            let audit = AuditService::new(self.db.clone());
            audit
                .log(
                    AuditEventType::FileUpload,
                    Some(user_id.clone()), // Use captured user_id
                    Some(new_id.clone()),
                    "upload",
                    "success",
                    None,
                    None,
                )
                .await;

            new_id
        };

        // Save Metadata and Tags
        if let Err(e) = self
            .save_metadata_and_tags(&storage_file_id, &user_file_id, analysis_result)
            .await
        {
            tracing::error!("Failed to save metadata and tags: {}", e);
        }

        Ok((user_file_id, expires_at))
    }

    pub async fn link_existing_file(
        &self,
        storage_file_id: String,
        filename: String,
        user_id: String,
        parent_id: Option<String>,
        expiration_hours: Option<i64>,
    ) -> Result<(String, Option<chrono::DateTime<Utc>>), AppError> {
        // 1. Verify storage file exists
        let sf = StorageFiles::find_by_id(&storage_file_id)
            .one(&self.db)
            .await?
            .ok_or_else(|| AppError::NotFound("Storage file not found".to_string()))?;

        // 2. Increment ref_count
        let mut active: storage_files::ActiveModel = sf.clone().into();
        active.ref_count = Set(sf.ref_count + 1);
        active.update(&self.db).await?;

        let expires_at = expiration_hours.map(|h| Utc::now() + Duration::hours(h));

        // Check for existing file with same name in the same folder for merging
        let existing_user_file = UserFiles::find()
            .filter(user_files::Column::UserId.eq(&user_id))
            .filter(user_files::Column::Filename.eq(&filename))
            .filter(user_files::Column::ParentId.eq(parent_id.clone()))
            .filter(user_files::Column::IsFolder.eq(false))
            .filter(user_files::Column::DeletedAt.is_null())
            .one(&self.db)
            .await?;

        let user_file_id = if let Some(existing) = existing_user_file {
            // Merge logic: Update existing record to point to new storage file
            let old_storage_file_id = existing.storage_file_id.clone();
            let existing_id = existing.id.clone();

            let mut active: user_files::ActiveModel = existing.into();
            active.storage_file_id = Set(Some(storage_file_id.clone()));
            active.expires_at = Set(expires_at);
            active.created_at = Set(Some(Utc::now()));
            active.update(&self.db).await?;

            // Decrement ref count of old storage file if it's different
            if let Some(old_id) = old_storage_file_id
                && old_id != storage_file_id
            {
                let _ = crate::services::storage_lifecycle::StorageLifecycleService::decrement_ref_count(
                        &self.db,
                        self.storage.as_ref(),
                        &old_id,
                    )
                    .await;
            }
            existing_id
        } else {
            // 3. Create user file entry
            let new_id = Uuid::new_v4().to_string();
            let user_file = user_files::ActiveModel {
                id: Set(new_id.clone()),
                user_id: Set(user_id),
                storage_file_id: Set(Some(storage_file_id.clone())),
                filename: Set(filename),
                parent_id: Set(parent_id),
                expires_at: Set(expires_at),
                created_at: Set(Some(Utc::now())),
                is_folder: Set(false),
                ..Default::default()
            };

            user_file.insert(&self.db).await?;
            new_id
        };

        // 4. Link metadata and tags (reuse existing logic)
        let _ = self
            .save_metadata_and_tags(&storage_file_id, &user_file_id, None)
            .await;

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
