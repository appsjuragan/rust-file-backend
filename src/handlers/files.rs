use axum::{
    extract::{State, Multipart},
    http::StatusCode,
    Json,
    Extension,
};
use serde::Serialize;
use crate::utils::auth::Claims;
use uuid::Uuid;
use chrono::{Utc, Duration};
use utoipa::ToSchema;
use tokio_util::io::StreamReader;
use futures::{TryStreamExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncRead};
use crate::utils::validation::{validate_upload, sanitize_filename};
use crate::services::scanner::ScanResult;
use serde::Deserialize;

#[derive(Serialize, ToSchema)]
pub struct UploadResponse {
    pub file_id: String,
    pub filename: String,
    pub expires_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Deserialize, ToSchema)]
pub struct PreCheckRequest {
    pub full_hash: String,
    pub size: i64,
    pub chunk_hashes: Option<Vec<ChunkHash>>,
}

#[derive(Serialize, ToSchema)]
pub struct PreCheckResponse {
    pub exists: bool,
    pub upload_token: Option<String>,
    pub file_id: Option<String>,
}

#[derive(Deserialize, Serialize, ToSchema, Clone)]
pub struct ChunkHash {
    pub offset: i64,
    pub size: i64,
    pub hash: String,
}

#[utoipa::path(
    post,
    path = "/pre-check",
    request_body = PreCheckRequest,
    responses(
        (status = 200, description = "Pre-check successful", body = PreCheckResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn pre_check_dedup(
    State(state): State<crate::AppState>,
    Extension(_claims): Extension<Claims>,
    Json(req): Json<PreCheckRequest>,
) -> Result<Json<PreCheckResponse>, (StatusCode, String)> {
    let existing = sqlx::query_as::<_, crate::models::StorageFile>(
        "SELECT id, hash, s3_key, size, ref_count, scan_status, scan_result, scanned_at, mime_type, content_type FROM storage_files WHERE hash = ? AND size = ?"
    )
    .bind(&req.full_hash)
    .bind(req.size)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(file) = existing {
        // Build response based on existing file
        Ok(Json(PreCheckResponse {
            exists: true,
            upload_token: None,
            file_id: Some(file.id),
        }))
    } else {
        // File doesn't exist, return upload token (implied by client logic, or we could generate one)
        // For now, simpler: just say it doesn't exist
        Ok(Json(PreCheckResponse {
            exists: false,
            upload_token: Some(Uuid::new_v4().to_string()),
            file_id: None,
        }))
    }
}

#[utoipa::path(
    post,
    path = "/upload",
    request_body(content = Multipart, description = "File upload"),
    responses(
        (status = 200, description = "File uploaded successfully", body = UploadResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn upload_file(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, (StatusCode, String)> {
    let mut filename = String::new();
    let mut expiration_hours: Option<i64> = None;
    let mut upload_result = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))? {
        let name = field.name().unwrap_or_default().to_string();
        
        if name == "file" {
            let original_filename = field.file_name().unwrap_or("unnamed").to_string();
            let content_type = field.content_type().map(|s| s.to_string());
            
            // 1. Sanitize filename
            filename = sanitize_filename(&original_filename)
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

            // 2. Peek into stream for magic bytes
            let body_with_io_error = field.map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err));
            let mut reader = StreamReader::new(body_with_io_error);
            
            let mut header_buffer = [0u8; 1024]; // Read up to 1KB header
            let n = reader.read(&mut header_buffer).await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Read error: {}", e)))?;
            let header = &header_buffer[..n];

            // 3. Early Validation (MIME + Magic Bytes)
            validate_upload(&filename, content_type.as_deref(), 0, header)
                 .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

            // Reconstruct stream
            let header_cursor = std::io::Cursor::new(header.to_vec());
            let chained_reader = tokio::io::AsyncReadExt::chain(header_cursor, reader);
            
            // 4. Upload to Staging
            let staging_key = format!("staging/{}", Uuid::new_v4());
            let res = state.storage.upload_stream_with_hash(&staging_key, chained_reader).await
                .map_err(|e| {
                    tracing::error!("S3 staging upload failed: {:?}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
                })?;
            
            // 5. Post-upload Size Validation
            if let Err(e) = crate::utils::validation::validate_file_size(res.size as usize) {
                let _ = state.storage.delete_file(&staging_key).await;
                return Err((StatusCode::PAYLOAD_TOO_LARGE, e.to_string()));
            }
            
            upload_result = Some(res);
        } else if name == "expiration_hours" {
            let text = field.text().await.unwrap_or_default();
            expiration_hours = text.parse().ok();
        }
    }

    let upload = upload_result.ok_or((StatusCode::BAD_REQUEST, "No file provided".to_string()))?;

    // Check for deduplication
    let existing_storage_file = sqlx::query_as::<_, crate::models::StorageFile>(
        "SELECT id, hash, s3_key, size, ref_count, scan_status, scan_result, scanned_at, mime_type, content_type FROM storage_files WHERE hash = ?"
    )
    .bind(&upload.hash)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let storage_file_id = if let Some(sf) = existing_storage_file {
        // Deduplication hit!
        sqlx::query("UPDATE storage_files SET ref_count = ref_count + 1 WHERE id = ?")
            .bind(&sf.id)
            .execute(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
        let _ = state.storage.delete_file(&upload.s3_key).await;
        sf.id
    } else {
        // New unique file!
        // 6. Virus Scanning on Staging File
        if state.config.enable_virus_scan {
            let stream = state.storage.get_object_stream(&upload.s3_key).await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to open for scanning: {}", e)))?;
            
            // Note: Optimally we would stream directly to scanner. 
            // Here we buffer into memory which is okay for <256MB but not ideal for massive scale.
            // Future improvement: implement streaming to scanner.
            let bytes = stream.collect().await
                .map(|b| b.into_bytes())
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            
            match state.scanner.scan(&bytes).await {
                Ok(ScanResult::Clean) => {
                    tracing::info!("Virus scan passed for {}", upload.hash);
                },
                Ok(ScanResult::Infected { threat_name }) => {
                    tracing::warn!("Virus detected in {}: {}", upload.hash, threat_name);
                    let _ = state.storage.delete_file(&upload.s3_key).await;
                    return Err((StatusCode::BAD_REQUEST, format!("File rejected: Virus detected ({})", threat_name)));
                },
                Ok(ScanResult::Error { reason }) => {
                    tracing::error!("Virus scan error for {}: {}", upload.hash, reason);
                    // Fail open or closed? Security recommendation: Fail closed.
                    let _ = state.storage.delete_file(&upload.s3_key).await;
                    return Err((StatusCode::INTERNAL_SERVER_ERROR, "Virus scan failed to complete".to_string()));
                },
                Err(e) => {
                    tracing::error!("Virus scan failed: {}", e);
                    let _ = state.storage.delete_file(&upload.s3_key).await;
                    return Err((StatusCode::INTERNAL_SERVER_ERROR, "Scanner unavailable".to_string()));
                }
            }
        }

        let id = Uuid::new_v4().to_string();
        let permanent_key = format!("{}/{}", upload.hash, filename);
        
        state.storage.copy_object(&upload.s3_key, &permanent_key).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("S3 move failed: {}", e)))?;
        
        let _ = state.storage.delete_file(&upload.s3_key).await;

        sqlx::query(
            "INSERT INTO storage_files (id, hash, s3_key, size, ref_count, mime_type, scan_status, scanned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&upload.hash)
        .bind(&permanent_key)
        .bind(upload.size)
        .bind(1)
        .bind("application/octet-stream") // We should persist detected mime, but simplified here
        .bind(if state.config.enable_virus_scan { "clean" } else { "unchecked" })
        .bind(Utc::now())
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
        id
    };

    let user_file_id = Uuid::new_v4().to_string();
    let expires_at = expiration_hours.map(|h| Utc::now() + Duration::hours(h));

    sqlx::query(
        "INSERT INTO user_files (id, user_id, storage_file_id, filename, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&user_file_id)
    .bind(&claims.sub)
    .bind(&storage_file_id)
    .bind(&filename)
    .bind(expires_at)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert user_file: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    Ok(Json(UploadResponse {
        file_id: user_file_id,
        filename,
        expires_at,
    }))
}
