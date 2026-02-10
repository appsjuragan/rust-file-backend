use crate::api::error::AppError;
use crate::config::SecurityConfig;
use crate::entities::{prelude::*, *};
use crate::services::{
    audit::{AuditEventType, AuditService},
    metadata::MetadataService,
    scanner::VirusScanner,
    storage::StorageService,
};
use crate::utils::validation::validate_upload;
use chrono::{Duration, Utc};
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use std::sync::Arc;
use tokio::io::{AsyncRead, AsyncReadExt};
use uuid::Uuid;

pub struct FileService {
    db: DatabaseConnection,
    storage: Arc<dyn StorageService>,
    scanner: Arc<dyn VirusScanner>,
    config: SecurityConfig,
    bulk_lock: crate::utils::keyed_mutex::KeyedMutex,
}

pub struct StagedFile {
    pub key: String,
    pub hash: String,
    pub size: i64,
    pub s3_key: String,
    // Path to local temp file if available (for optimization)
    pub temp_path: Option<String>,
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
            bulk_lock: crate::utils::keyed_mutex::KeyedMutex::new(),
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

        // 2. Load Validation Rules from DB
        let rules =
            crate::utils::validation::ValidationRules::load(&self.db, self.config.max_file_size, self.config.chunk_size)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Failed to load validation rules: {}", e))
                })?;

        // 3. Early Validation
        validate_upload(
            filename,
            content_type,
            0,
            header,
            self.config.max_file_size,
            &rules,
        )
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

        // Reconstruct stream
        let header_cursor = std::io::Cursor::new(header.to_vec());
        let chained_reader = tokio::io::AsyncReadExt::chain(header_cursor, reader);

        // 4. Stream Directly to S3 (No Local Temp File)
        let staging_key = format!("staging/{}", Uuid::new_v4());
        tracing::info!(
            "Starting streaming S3 upload for {} to {}",
            filename,
            staging_key
        );

        // Wrap current reader in a Stream Reader needed by upload_stream_with_hash implementation
        // Actually upload_stream_with_hash takes Box<dyn AsyncRead> so chained_reader works if boxed.
        let upload_res = self
            .storage
            .upload_stream_with_hash(&staging_key, Box::new(chained_reader))
            .await
            .map_err(|e| AppError::Internal(format!("Upload failed: {}", e)))?;

        // 5. Check size limit AFTER upload (since we stream)
        // Ideally we should check during upload, but storage service needs modification for that.
        // For now, if sizes > max, we delete and error.
        if upload_res.size > self.config.max_file_size as i64 {
            let _ = self.storage.delete_file(&staging_key).await;
            return Err(AppError::PayloadTooLarge(
                "File size limits exceeded".to_string(),
            ));
        }

        Ok(StagedFile {
            key: staging_key.clone(),
            hash: upload_res.hash,
            size: upload_res.size,
            s3_key: staging_key,
            temp_path: None, // No local copy
        })
    }

    pub async fn process_upload(
        &self,
        staged: StagedFile,
        filename: String,
        user_id: String,
        parent_id: Option<String>,
        expiration_hours: Option<i64>,
        _total_size: Option<u64>,
    ) -> Result<(String, Option<chrono::DateTime<Utc>>), AppError> {
        // Check for deduplication (Required to handle the staged file correctly)
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

            if staged.s3_key != "skipped" {
                let _ = self.storage.delete_file(&staged.s3_key).await;
            }
            sf.id
        } else {
            // New unique file!

            // 1. Get bytes for Metadata Analysis (Header only)
            // Since we don't have a local temp file, we fetch the first 16KB from S3 staging
            let bytes = if let Some(local_path) = &staged.temp_path {
                let mut file = tokio::fs::File::open(local_path)
                    .await
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let mut buffer = vec![0u8; 16 * 1024];
                let n = file
                    .read(&mut buffer)
                    .await
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                buffer.truncate(n);
                buffer
            } else {
                // S3 Stream Logic
                let output = self
                    .storage
                    .get_object_range(&staged.s3_key, "bytes=0-16383")
                    .await
                    .map_err(|e| {
                        AppError::Internal(format!("Failed to fetch metadata bytes from S3: {}", e))
                    })?;

                let mut body = output.body.into_async_read();
                let mut buffer = Vec::new();
                body.read_to_end(&mut buffer).await.map_err(|e| {
                    AppError::Internal(format!("Failed to read metadata bytes: {}", e))
                })?;
                buffer
            };

            // 2. Metadata Analysis
            let analysis = MetadataService::analyze(&bytes, &filename);
            let mime_type = analysis.metadata["mime_type"]
                .as_str()
                .unwrap_or("application/octet-stream")
                .to_string();
            analysis_result = Some(analysis);

            let id = Uuid::new_v4().to_string();
            let permanent_key = format!("{}/{}", staged.hash, filename);

            if staged.s3_key != "skipped" {
                // Move S3 Object to permanent location
                self.storage
                    .copy_object(&staged.s3_key, &permanent_key)
                    .await
                    .map_err(|e| AppError::Internal(format!("S3 move failed: {}", e)))?;
                let _ = self.storage.delete_file(&staged.s3_key).await;
            }

            let scan_status = if self.config.enable_virus_scan {
                "pending"
            } else {
                "unchecked"
            }
            .to_string();

            // Insert Record First
            let new_storage_file = storage_files::ActiveModel {
                id: Set(id.clone()),
                hash: Set(staged.hash.clone()),
                s3_key: Set(permanent_key.clone()),
                size: Set(staged.size),
                ref_count: Set(1),
                mime_type: Set(Some(mime_type)),
                scan_status: Set(Some(scan_status)),
                scan_result: Set(None),
                scanned_at: Set(None),
                ..Default::default()
            };

            match new_storage_file.insert(&self.db).await {
                Ok(_) => {
                    // Spawn Async Scan Task
                    if self.config.enable_virus_scan {
                        let scanner = self.scanner.clone();
                        let db = self.db.clone();
                        let file_id = id.clone();
                        let temp_path_opt = staged.temp_path.clone();
                        let storage = self.storage.clone();
                        let s3_key = permanent_key.clone();

                        // Mark as scanning immediately in the DB to claim the task
                        let _ = storage_files::Entity::update_many()
                            .col_expr(storage_files::Column::ScanStatus, sea_orm::sea_query::Expr::value("scanning"))
                            .filter(storage_files::Column::Id.eq(file_id.clone()))
                            .exec(&self.db)
                            .await;

                        tokio::spawn(async move {
                            tracing::info!("🚀 Starting immediate virus scan for file: {} (S3: {})", file_id, s3_key);

                            let scan_res = if let Some(ref path) = temp_path_opt
                                && let Ok(file) = tokio::fs::File::open(&path).await
                            {
                                scanner.scan(Box::pin(file)).await
                            } else if temp_path_opt.is_some() {
                                // Failed to open temp file
                                Ok(crate::services::scanner::ScanResult::Error {
                                    reason: "Temp file lost".to_string(),
                                })
                            } else {
                                // S3 Stream Scanning
                                match storage.get_object_stream(&s3_key).await {
                                    Ok(output) => {
                                        let stream = output.body.into_async_read();
                                        scanner.scan(Box::pin(stream)).await
                                    }
                                    Err(e) => Ok(crate::services::scanner::ScanResult::Error {
                                        reason: format!("Failed to open S3 stream for scan: {}", e),
                                    }),
                                }
                            };

                            let (status, result) = match scan_res {
                                Ok(crate::services::scanner::ScanResult::Clean) => {
                                    tracing::info!("✅ Scan clean: {}", file_id);
                                    ("clean", None)
                                }
                                Ok(crate::services::scanner::ScanResult::Infected {
                                    threat_name,
                                }) => {
                                    tracing::warn!(
                                        "🚨 Scan infected: {} ({})",
                                        file_id,
                                        threat_name
                                    );
                                    ("infected", Some(threat_name))
                                }
                                Ok(crate::services::scanner::ScanResult::Error { reason }) => {
                                    tracing::error!("❌ Scan error for {}: {}", file_id, reason);
                                    ("error", Some(reason))
                                }
                                Err(e) => {
                                    tracing::error!("❌ Scan failed for {}: {}", file_id, e);
                                    ("error", Some(e.to_string()))
                                }
                            };

                            use crate::entities::storage_files;
                            let update = storage_files::ActiveModel {
                                id: Set(file_id),
                                scan_status: Set(Some(status.to_string())),
                                scan_result: Set(result),
                                scanned_at: Set(Some(Utc::now())),
                                ..Default::default()
                            };
                            if let Err(e) = update.update(&db).await {
                                tracing::error!("Failed to update scan status: {}", e);
                            }

                            // Cleanup Temp File (if any)
                            if let Some(path) = temp_path_opt
                                && let Err(e) = tokio::fs::remove_file(&path).await
                            {
                                tracing::warn!("Failed to delete temp file {}: {}", path, e);
                            }
                        });
                    }

                    id
                }
                Err(e)
                    if e.to_string().contains("23505")
                        || e.to_string().contains("2067")
                        || e.to_string().contains("duplicate") =>
                {
                    // Fallback to dedup (race condition)
                    tracing::warn!(
                        "Duplicate hash detected during insert (race condition). Using existing record."
                    );
                    let existing = StorageFiles::find()
                        .filter(storage_files::Column::Hash.eq(&staged.hash))
                        .one(&self.db)
                        .await
                        .map_err(|e| AppError::Internal(e.to_string()))?
                        .ok_or_else(|| {
                            AppError::Internal(
                                "Race condition: duplicate signaled but record not found"
                                    .to_string(),
                            )
                        })?;

                    // Increment ref_count for the existing record
                    let mut active: storage_files::ActiveModel = existing.clone().into();
                    active.ref_count = Set(existing.ref_count + 1);
                    active
                        .update(&self.db)
                        .await
                        .map_err(|e| AppError::Internal(e.to_string()))?;

                    // Clean up the S3 object we just uploaded (since we don't need it)
                    if staged.s3_key != "skipped" {
                        let _ = self.storage.delete_file(&staged.s3_key).await;
                    }

                    existing.id
                }
                Err(e) => return Err(AppError::Internal(e.to_string())),
            }
        };

        let expires_at = expiration_hours.map(|h| Utc::now() + Duration::hours(h));

        // No Key Generation
        // let user_pub_key = user.public_key ...
        // let file_key = EncryptionService::derive_key_from_hash(&staged.hash);
        // let wrapped_key = EncryptionService::wrap_key ...

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
            // active.file_signature = Set(Some(wrapped_key)); // No Key
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
                // file_signature: Set(Some(wrapped_key)), // No Key
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

        // Background update facts
        let db = self.db.clone();
        let uid = user_id.clone();
        tokio::spawn(async move {
            let _ =
                crate::services::facts_service::FactsService::update_user_facts(&db, &uid).await;
        });

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
            let normalized_name = tag_name.to_lowercase();

            let tag = match Tags::find()
                .filter(tags::Column::Name.eq(&normalized_name))
                .one(&self.db)
                .await?
            {
                Some(t) => t,
                None => {
                    let new_tag = tags::ActiveModel {
                        id: Set(Uuid::new_v4().to_string()),
                        name: Set(normalized_name.clone()),
                    };

                    match new_tag.insert(&self.db).await {
                        Ok(t) => t,
                        Err(e)
                            if e.to_string().contains("duplicate")
                                || e.to_string().contains("unique") =>
                        {
                            // Race condition: another thread inserted it. Refetch.
                            Tags::find()
                                .filter(tags::Column::Name.eq(&normalized_name))
                                .one(&self.db)
                                .await?
                                .ok_or_else(|| {
                                    AppError::Internal(
                                        "Tag missing after duplicate error".to_string(),
                                    )
                                })?
                        }
                        Err(e) => return Err(e.into()),
                    }
                }
            };

            let link = file_tags::ActiveModel {
                user_file_id: Set(user_file_id.to_string()),
                tag_id: Set(tag.id),
            };

            // Ignore error if link already exists (unique primary key)
            let _ = link.insert(&self.db).await;
        }

        Ok(())
    }
    pub async fn delete_item(&self, user_id: &str, id: &str) -> Result<(), AppError> {
        use crate::services::storage_lifecycle::StorageLifecycleService;
        use sea_orm::TransactionTrait;

        let item = UserFiles::find_by_id(id)
            .filter(user_files::Column::UserId.eq(user_id))
            .filter(user_files::Column::DeletedAt.is_null())
            .one(&self.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Item not found".to_string()))?;

        // Lock user scope
        let _lock = if item.is_folder {
            let lock = self.bulk_lock.lock(user_id).await;
            tracing::info!(
                "🔒 Scoped lock acquired for folder delete: {} (User: {})",
                item.filename,
                user_id
            );
            Some(lock)
        } else {
            None
        };

        // Start Transaction
        let txn = self.db.begin().await.map_err(AppError::Database)?;

        if item.is_folder {
            StorageLifecycleService::delete_folder_recursive(&txn, self.storage.as_ref(), &item.id)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }

        StorageLifecycleService::soft_delete_user_file(&txn, self.storage.as_ref(), &item)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        txn.commit().await.map_err(AppError::Database)?;

        // Background update facts
        let db = self.db.clone();
        let uid = user_id.to_string();
        tokio::spawn(async move {
            let _ =
                crate::services::facts_service::FactsService::update_user_facts(&db, &uid).await;
        });

        Ok(())
    }

    pub async fn bulk_delete(
        &self,
        user_id: &str,
        item_ids: Vec<String>,
    ) -> Result<usize, AppError> {
        // Lock user scope
        let _lock = self.bulk_lock.lock(user_id).await;
        tracing::info!(
            "🔒 Scoped lock acquired for bulk delete by user {}",
            user_id
        );

        use crate::services::storage_lifecycle::StorageLifecycleService;
        // bulk_delete handles its own transaction
        let count = StorageLifecycleService::bulk_delete(
            &self.db,
            self.storage.as_ref(),
            user_id,
            item_ids,
        )
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        // Background update facts
        let db = self.db.clone();
        let uid = user_id.to_string();
        tokio::spawn(async move {
            let _ =
                crate::services::facts_service::FactsService::update_user_facts(&db, &uid).await;
        });

        Ok(count)
    }

    pub async fn bulk_move(
        &self,
        user_id: &str,
        item_ids: Vec<String>,
        new_parent_id: Option<String>,
    ) -> Result<usize, AppError> {
        use sea_orm::TransactionTrait;

        // Lock user scope
        let _lock = self.bulk_lock.lock(user_id).await;
        tracing::info!("🔒 Scoped lock acquired for bulk move by user {}", user_id);

        let txn = self.db.begin().await.map_err(AppError::Database)?;
        let mut moved_count = 0;

        for id in item_ids {
            // Reusing the logic from rename_item but in a bulk context
            let item = UserFiles::find_by_id(&id)
                .filter(user_files::Column::UserId.eq(user_id))
                .one(&txn)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?
                .ok_or_else(|| AppError::NotFound(format!("Item {} not found", id)))?;

            // Basic circularity check (simplified for bulk)
            if let Some(ref target_id) = new_parent_id
                && item.is_folder
                && target_id == &item.id
            {
                continue; // Skip invalid moves in bulk
            }

            let mut active: user_files::ActiveModel = item.into();
            active.parent_id = Set(new_parent_id.clone());
            active
                .update(&txn)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
            moved_count += 1;
        }

        txn.commit().await.map_err(AppError::Database)?;

        // Background update facts
        let db = self.db.clone();
        let uid = user_id.to_string();
        tokio::spawn(async move {
            let _ =
                crate::services::facts_service::FactsService::update_user_facts(&db, &uid).await;
        });

        Ok(moved_count)
    }
}
