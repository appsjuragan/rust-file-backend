use crate::api::error::AppError;
use crate::api::handlers::files::ArchiveStatusResponse;
use crate::entities::{prelude::*, *};
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set,
    sea_query::Expr,
};
use uuid::Uuid;
use std::collections::HashSet;

use super::FileService;

// Background task limits
const MAX_ARCHIVE_DEPTH: usize = 20;
const MAX_ARCHIVE_ITEMS: usize = 5000;

impl FileService {
    pub async fn create_archive(
        &self,
        user_id: &str,
        item_ids: Vec<String>,
    ) -> Result<String, AppError> {
        let archive_id = Uuid::new_v4().to_string();
        
        let file_count = item_ids.len();
        if file_count > MAX_ARCHIVE_ITEMS {
            return Err(AppError::BadRequest(format!("Maximum {} items per request", MAX_ARCHIVE_ITEMS)));
        }
        let filename = if file_count == 1 {
            // Check if it's a folder
            let item = UserFiles::find_by_id(&item_ids[0])
                .filter(user_files::Column::UserId.eq(user_id))
                .filter(user_files::Column::DeletedAt.is_null())
                .one(&self.db)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?
                .ok_or_else(|| AppError::NotFound("Item not found".to_string()))?;
            
            format!("{}.zip", item.filename)
        } else {
            "archive.zip".to_string()
        };

        // Create the archive record in 'pending' status
        let new_archive = download_archives::ActiveModel {
            id: Set(archive_id.clone()),
            user_id: Set(user_id.to_string()),
            status: Set("pending".to_string()),
            filename: Set(filename),
            file_size: Set(Some(0)), // Will update later
            created_at: Set(Utc::now()),
            expires_at: Set(Utc::now() + chrono::Duration::hours(24)),
            ..Default::default()
        };

        new_archive
            .insert(&self.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Spawn a background task to process the ZIP
        let db = self.db.clone();
        let storage = self.storage.clone();
        let user_id = user_id.to_string();
        let archive_id_bg = archive_id.clone();
        
        tokio::spawn(async move {
            if let Err(e) = super::FileService::generate_and_upload_zip(
                db.clone(),
                storage,
                user_id,
                item_ids,
                archive_id_bg.clone(),
            ).await {
                tracing::error!("Failed to generate ZIP archive {}: {}", archive_id_bg, e);
                // Update to failed state
                let _ = download_archives::Entity::update_many()
                    .col_expr(download_archives::Column::Status, Expr::value("failed"))
                    .col_expr(download_archives::Column::ErrorMessage, Expr::value(e.to_string()))
                    .filter(download_archives::Column::Id.eq(archive_id_bg))
                    .exec(&db).await;
            }
        });

        Ok(archive_id)
    }

    pub async fn get_archive_status(
        &self,
        user_id: &str,
        archive_id: &str,
    ) -> Result<ArchiveStatusResponse, AppError> {
        let archive = DownloadArchives::find_by_id(archive_id)
            .filter(download_archives::Column::UserId.eq(user_id))
            .one(&self.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Archive not found".to_string()))?;

        let mut res = ArchiveStatusResponse {
            id: archive.id,
            status: archive.status.clone(),
            filename: archive.filename.clone(),
            file_size: archive.file_size,
            error_message: archive.error_message,
            ticket: None,
            url: None,
            expires_at: Some(archive.expires_at),
        };

        if archive.status == "ready" {
            if let Some(s3_key) = archive.s3_key {
                let presigned_url = self.storage.generate_presigned_url(
                    &s3_key,
                    12 * 3600, // 12 hours
                    "application/zip",
                    &format!("attachment; filename=\"{}\"", res.filename),
                ).await.map_err(|e| AppError::Internal(e.to_string()))?;
                
                res.url = Some(presigned_url);
            }
        }

        Ok(res)
    }

    // This is the background task
    async fn generate_and_upload_zip(
        db: sea_orm::DatabaseConnection,
        storage: std::sync::Arc<dyn crate::services::storage::StorageService>,
        user_id: String,
        item_ids: Vec<String>,
        archive_id: String,
    ) -> anyhow::Result<()> {
        
        // 1. Update status to generating
        let _ = download_archives::Entity::update_many()
            .col_expr(download_archives::Column::Status, Expr::value("generating"))
            .filter(download_archives::Column::Id.eq(&archive_id))
            .exec(&db).await;

        // 2. Collect all files recursively
        let mut files_to_zip = Vec::new();
        let mut visited = HashSet::new();

        #[async_recursion::async_recursion]
        async fn collect_files(
            db: &sea_orm::DatabaseConnection,
            user_id: &str,
            ids: Vec<String>,
            base_path: &str,
            visited: &mut HashSet<String>,
            files_to_zip: &mut Vec<(String, String)>,
            depth: usize,
        ) -> anyhow::Result<()> {
            if ids.is_empty() { return Ok(()); }
            if depth > MAX_ARCHIVE_DEPTH {
                return Err(anyhow::anyhow!("Maximum directory depth reached"));
            }
            if files_to_zip.len() > MAX_ARCHIVE_ITEMS {
                return Err(anyhow::anyhow!("Maximum items per archive reached"));
            }

            let items = UserFiles::find()
                .filter(user_files::Column::Id.is_in(ids))
                .filter(user_files::Column::UserId.eq(user_id))
                .filter(user_files::Column::DeletedAt.is_null())
                .all(db)
                .await?;

            for item in items {
                if visited.contains(&item.id) { continue; }
                visited.insert(item.id.clone());

                let current_path = if base_path.is_empty() {
                    item.filename.clone()
                } else {
                    format!("{}/{}", base_path, item.filename)
                };

                if item.is_folder {
                    let children = UserFiles::find()
                        .filter(user_files::Column::ParentId.eq(item.id.clone()))
                        .filter(user_files::Column::UserId.eq(user_id))
                        .filter(user_files::Column::DeletedAt.is_null())
                        .all(db)
                        .await?;
                    
                    let child_ids: Vec<String> = children.into_iter().map(|c| c.id).collect();
                    collect_files(db, user_id, child_ids, &current_path, visited, files_to_zip, depth + 1).await?;
                } else {
                    if let Some(storage_file_id) = item.storage_file_id {
                        let sf = StorageFiles::find_by_id(storage_file_id)
                            .one(db)
                            .await?
                            .ok_or_else(|| anyhow::anyhow!("Storage file missing"))?;
                            
                        files_to_zip.push((sf.s3_key, current_path));
                    }
                }
            }
            Ok(())
        }

        collect_files(&db, &user_id, item_ids, "", &mut visited, &mut files_to_zip, 0).await?;

        // 3. Generate ZIP into a tempfile using blocking task
        let temp_dir = tempfile::tempdir()?;
        let zip_path = temp_dir.path().join("archive.zip");
        
        let storage_clone = storage.clone();
        let zip_path_clone = zip_path.clone();
        
        // Use spawn_blocking for CPU/Sync-IO tasks to avoid stalling the async runtime
        tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
            let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
            let zip_file = std::fs::File::create(&zip_path_clone)?;
            let mut zip = zip::ZipWriter::new(zip_file);
            let options = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .unix_permissions(0o755);

            for (s3_key, zip_entry_path) in files_to_zip {
                // Fetch each object (needs runtime for the async call)
                let res = runtime.block_on(storage_clone.get_object_stream(&s3_key))?;
                let mut stream = res.body.into_async_read();
                
                // Stream to a temp file first (sync inside spawn_blocking)
                let temp_id = uuid::Uuid::new_v4().to_string();
                let temp_f = std::fs::File::create(std::env::temp_dir().join(&temp_id))?;
                
                runtime.block_on(async {
                    let mut tokio_temp_f = tokio::fs::File::from_std(temp_f.try_clone()?);
                    tokio::io::copy(&mut stream, &mut tokio_temp_f).await?;
                    tokio_temp_f.sync_all().await?;
                    anyhow::Result::<()>::Ok(())
                })?;

                // Add to zip (sync)
                zip.start_file(zip_entry_path, options)?;
                let mut local_f = std::fs::File::open(std::env::temp_dir().join(&temp_id))?;
                std::io::copy(&mut local_f, &mut zip)?;
                
                // Clean up local temp file
                let _ = std::fs::remove_file(std::env::temp_dir().join(&temp_id));
            }
            
            zip.finish()?;
            Ok(())
        }).await??;

        // 4. Finalize
        let metadata = std::fs::metadata(&zip_path)?;
        let file_size = metadata.len();

        let s3_target_key = format!("archives/{}/{}", user_id, archive_id);
        let f = tokio::fs::File::open(&zip_path).await?;
        
        storage.upload_stream_with_hash(
            &s3_target_key,
            Box::new(f)
        ).await.map_err(|e| anyhow::anyhow!("Failed to upload zip: {}", e))?;

        let mut active_archive = download_archives::ActiveModel {
            id: Set(archive_id.clone()),
            ..Default::default()
        };
        active_archive.status = Set("ready".to_string());
        active_archive.s3_key = Set(Some(s3_target_key));
        active_archive.file_size = Set(Some(file_size as i64));
        
        download_archives::Entity::update(active_archive)
            .filter(download_archives::Column::Id.eq(archive_id))
            .exec(&db)
            .await?;

        Ok(())
    }
}
