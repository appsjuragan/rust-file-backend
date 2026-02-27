use crate::config::SecurityConfig;

use crate::entities::upload_sessions;
use crate::services::file_service::{FileService, StagedFile};
use crate::services::storage::StorageService;
use anyhow::{Result, anyhow};
use chrono::Utc;
use sea_orm::ActiveValue::Set;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, ModelTrait, QueryFilter,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use utoipa::ToSchema;
use uuid::Uuid;
use xxhash_rust::xxh3::Xxh3;

#[derive(Serialize, Deserialize, ToSchema)]
pub struct InitUploadRequest {
    pub file_name: String,
    pub file_type: Option<String>,
    pub total_size: i64,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct InitUploadResponse {
    pub upload_id: String,
    pub chunk_size: i64,
    pub key: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct UploadPartResponse {
    pub etag: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct CompleteUploadRequest {
    pub parent_id: Option<Uuid>,
    pub hash: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct FileResponse {
    pub id: String,
    pub name: String,
    pub is_folder: bool,
    pub size: Option<i64>,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
    pub mime_type: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PartInfo {
    pub part_number: i32,
    pub etag: String,
}

#[derive(Serialize, ToSchema)]
pub struct PendingSessionResponse {
    pub upload_id: String,
    pub file_name: String,
    pub file_type: Option<String>,
    pub total_size: i64,
    pub chunk_size: i64,
    pub total_chunks: i32,
    pub uploaded_chunks: i32,
    pub uploaded_parts: Vec<i32>,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
}

pub struct UploadService {
    db: DatabaseConnection,
    storage: Arc<dyn StorageService>,
    config: SecurityConfig,
    file_service: Arc<FileService>,
}

impl UploadService {
    pub fn new(
        db: DatabaseConnection,
        storage: Arc<dyn StorageService>,
        config: SecurityConfig,
        file_service: Arc<FileService>,
    ) -> Self {
        Self {
            db,
            storage,
            config,
            file_service,
        }
    }

    pub async fn init_upload(
        &self,
        user_id: String,
        req: InitUploadRequest,
    ) -> Result<InitUploadResponse> {
        if req.total_size > self.config.max_file_size as i64 {
            return Err(anyhow!(
                "File too large. Max: {} bytes",
                self.config.max_file_size
            ));
        }

        let chunk_size = self.config.chunk_size as i64;
        let total_chunks = (req.total_size as f64 / chunk_size as f64).ceil() as i32;
        let s3_key = format!("multipart/{}", Uuid::new_v4());

        let s3_upload_id = self.storage.create_multipart_upload(&s3_key).await?;

        let session = upload_sessions::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            user_id: Set(user_id),
            file_name: Set(req.file_name),
            file_type: Set(req.file_type),
            s3_key: Set(s3_key.clone()),
            upload_id: Set(s3_upload_id),
            chunk_size: Set(chunk_size),
            total_size: Set(req.total_size),
            total_chunks: Set(total_chunks),
            uploaded_chunks: Set(0),
            parts: Set(json!([])),
            status: Set("pending".to_string()),
            created_at: Set(Utc::now().into()),
            expires_at: Set((Utc::now() + chrono::Duration::hours(24)).into()),
        };

        let saved_session = session.insert(&self.db).await?;

        Ok(InitUploadResponse {
            upload_id: saved_session.id,
            chunk_size,
            key: s3_key,
        })
    }

    pub async fn upload_chunk(
        &self,
        user_id: String,
        session_id: String,
        part_number: i32,
        data: Vec<u8>,
    ) -> Result<UploadPartResponse> {
        let session = upload_sessions::Entity::find_by_id(&session_id)
            .filter(upload_sessions::Column::UserId.eq(&user_id))
            .one(&self.db)
            .await?
            .ok_or_else(|| anyhow!("Upload session not found"))?;

        if session.status != "pending" {
            return Err(anyhow!("Upload session is not pending"));
        }

        if part_number < 1 || part_number > session.total_chunks {
            return Err(anyhow!("Invalid part number"));
        }

        // Upload to S3
        let etag = self
            .storage
            .upload_part(&session.s3_key, &session.upload_id, part_number, data)
            .await?;

        // Update DB with transaction to avoid race conditions during parallel uploads
        use sea_orm::TransactionTrait;
        let db = self.db.clone();

        db.transaction::<_, (), anyhow::Error>(|txn| {
            let session_id = session_id.clone();
            let user_id = user_id.clone();
            let etag = etag.clone();
            Box::pin(async move {
                use sea_orm::QuerySelect;
                let session = upload_sessions::Entity::find_by_id(session_id)
                    .filter(upload_sessions::Column::UserId.eq(user_id))
                    .lock_exclusive()
                    .one(txn)
                    .await?
                    .ok_or_else(|| anyhow!("Upload session not found"))?;

                let mut parts: Vec<PartInfo> = serde_json::from_value(session.parts.clone())?;

                // Remove if existing (retry)
                parts.retain(|p| p.part_number != part_number);
                parts.push(PartInfo { part_number, etag });

                // Sort by part number for tidiness
                parts.sort_by_key(|p| p.part_number);

                let mut active: upload_sessions::ActiveModel = session.into();
                active.parts = Set(json!(parts));
                active.uploaded_chunks = Set(parts.len() as i32);

                active.update(txn).await?;
                Ok(())
            })
        })
        .await?;

        Ok(UploadPartResponse { etag })
    }

    pub async fn complete_upload(
        &self,
        user_id: String,
        session_id: String,
        req: CompleteUploadRequest,
    ) -> Result<FileResponse> {
        let session = upload_sessions::Entity::find_by_id(session_id.clone())
            .filter(upload_sessions::Column::UserId.eq(user_id.clone()))
            .one(&self.db)
            .await?
            .ok_or_else(|| anyhow!("Upload session not found"))?;

        if session.status != "pending" {
            return Err(anyhow!("Upload session is not pending"));
        }

        let parts: Vec<PartInfo> = serde_json::from_value(session.parts.clone())?;
        if parts.len() as i32 != session.total_chunks {
            return Err(anyhow!(
                "Incomplete upload. Expected {} chunks, got {}",
                session.total_chunks,
                parts.len()
            ));
        }

        // 1. Complete S3 Multipart
        let s3_parts: Vec<(i32, String)> = parts
            .iter()
            .map(|p| (p.part_number, p.etag.clone()))
            .collect();
        self.storage
            .complete_multipart_upload(&session.s3_key, &session.upload_id, s3_parts)
            .await?;

        // 2. Determine initial hash — use client-provided for fast response, verify async
        let client_hash = req.hash.clone();
        let hash = if let Some(ref h) = client_hash {
            tracing::info!(
                "Using client-provided hash (will verify async): {} for session: {}",
                h,
                session_id
            );
            h.clone()
        } else {
            // No client hash provided — must compute synchronously
            tracing::info!(
                "No client hash provided, calculating synchronously for session: {}",
                session_id
            );
            let mut hasher = Xxh3::new();
            let mut stream = self
                .storage
                .get_object_stream(&session.s3_key)
                .await?
                .body
                .into_async_read();
            let mut buffer = [0u8; 8192];
            loop {
                let n = stream.read(&mut buffer).await?;
                if n == 0 {
                    break;
                }
                hasher.update(&buffer[..n]);
            }
            let h = format!("{:032x}", hasher.digest128());
            tracing::info!("Calculated hash: {} for session: {}", h, session_id);
            h
        };

        // 3. Delegate to FileService (uses the hash — possibly client-provided)
        let staged_file = StagedFile {
            key: session.s3_key.clone(),
            hash: hash.clone(),
            size: session.total_size,
            s3_key: session.s3_key.clone(),
            temp_path: None,
        };

        tracing::info!("Delegating chunked file completion to FileService for processing...");
        let (file_id, _) = self
            .file_service
            .process_upload(
                staged_file,
                session.file_name.clone(),
                user_id.clone(),
                req.parent_id.map(|id| id.to_string()),
                None, // expiration
                Some(session.total_size as u64),
            )
            .await
            .map_err(|e| anyhow!("File processing failed: {}", e))?;
        tracing::info!(
            "File successfully processed by FileService. FileID: {}",
            file_id
        );

        // 4. Mark session completed
        let file_type = session.file_type.clone();
        let session_total_size = session.total_size;

        let mut active: upload_sessions::ActiveModel = session.into();
        active.status = Set("completed".to_string());
        active.update(&self.db).await?;

        // 5. Fetch and return file
        use crate::entities::user_files;
        let file = user_files::Entity::find_by_id(&file_id)
            .one(&self.db)
            .await?
            .ok_or_else(|| anyhow!("File created but not found"))?;

        // 6. If client hash was used, spawn async verification task
        if client_hash.is_some() {
            let storage = self.storage.clone();
            let db = self.db.clone();
            let client_hash_val = hash.clone();
            let storage_file_id = file.storage_file_id.clone();

            tokio::spawn(async move {
                if let Err(e) =
                    verify_hash_async(db, storage, storage_file_id, client_hash_val).await
                {
                    tracing::error!("❌ Async hash verification failed: {}", e);
                }
            });
        }

        Ok(FileResponse {
            id: file.id,
            name: file.filename,
            is_folder: file.is_folder,
            size: Some(session_total_size),
            created_at: file.created_at.unwrap_or(Utc::now()),
            updated_at: Utc::now(),
            mime_type: file_type,
            parent_id: file.parent_id,
        })
    }

    pub async fn abort_upload(&self, user_id: String, session_id: String) -> Result<()> {
        let session = upload_sessions::Entity::find_by_id(session_id)
            .filter(upload_sessions::Column::UserId.eq(user_id))
            .one(&self.db)
            .await?
            .ok_or_else(|| anyhow!("Upload session not found"))?;

        if session.status == "completed" {
            return Err(anyhow!("Cannot abort completed session"));
        }

        // Abort S3
        self.storage
            .abort_multipart_upload(&session.s3_key, &session.upload_id)
            .await?;

        // Delete from DB
        session.delete(&self.db).await?;

        Ok(())
    }

    pub async fn list_pending_sessions(
        &self,
        user_id: String,
    ) -> Result<Vec<PendingSessionResponse>> {
        let sessions = upload_sessions::Entity::find()
            .filter(upload_sessions::Column::UserId.eq(user_id))
            .filter(upload_sessions::Column::Status.eq("pending"))
            .all(&self.db)
            .await?;

        let mut result = Vec::new();
        for s in sessions {
            let parts: Vec<PartInfo> = serde_json::from_value(s.parts.clone()).unwrap_or_default();
            let uploaded_parts: Vec<i32> = parts.iter().map(|p| p.part_number).collect();
            result.push(PendingSessionResponse {
                upload_id: s.id,
                file_name: s.file_name,
                file_type: s.file_type,
                total_size: s.total_size,
                chunk_size: s.chunk_size,
                total_chunks: s.total_chunks,
                uploaded_chunks: s.uploaded_chunks,
                uploaded_parts,
                created_at: s.created_at,
            });
        }
        Ok(result)
    }
}

/// Background task: verify a client-provided hash by re-downloading and hashing the file server-side.
/// If mismatch, update the storage_files record with the correct hash.
async fn verify_hash_async(
    db: DatabaseConnection,
    storage: Arc<dyn StorageService>,
    storage_file_id: Option<String>,
    client_hash: String,
) -> Result<()> {
    use crate::entities::storage_files;

    let sf_id = storage_file_id.ok_or_else(|| anyhow!("No storage_file_id to verify"))?;

    let sf = storage_files::Entity::find_by_id(&sf_id)
        .one(&db)
        .await?
        .ok_or_else(|| anyhow!("Storage file not found: {}", sf_id))?;

    tracing::info!(
        "🔐 Async hash verification started for storage_file: {} (s3: {})",
        sf_id,
        sf.s3_key
    );

    let mut hasher = Xxh3::new();
    let mut stream = storage
        .get_object_stream(&sf.s3_key)
        .await?
        .body
        .into_async_read();
    let mut buffer = [0u8; 65536]; // 64KB buffer for faster streaming

    loop {
        let n = stream.read(&mut buffer).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    let server_hash = format!("{:032x}", hasher.digest128());

    if server_hash == client_hash {
        tracing::info!(
            "✅ Hash verified for storage_file {}: {}",
            sf_id,
            server_hash
        );
    } else {
        tracing::warn!(
            "⚠️ Hash MISMATCH for storage_file {}! Client: {} | Server: {} — updating record.",
            sf_id,
            client_hash,
            server_hash
        );
        let mut active: storage_files::ActiveModel = sf.into();
        active.hash = Set(server_hash.clone());
        active.update(&db).await?;
        tracing::info!(
            "✅ Hash corrected for storage_file {} to: {}",
            sf_id,
            server_hash
        );
    }

    Ok(())
}
