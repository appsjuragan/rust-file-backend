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
use futures::TryStreamExt;

#[derive(Serialize, ToSchema)]
pub struct UploadResponse {
    pub file_id: String,
    pub filename: String,
    pub expires_at: Option<chrono::DateTime<Utc>>,
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
    
    // We'll process the fields. We expect "file" to be one of them.
    // To handle 50k concurrency, we stream directly to S3 staging.
    let mut upload_result = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))? {
        let name = field.name().unwrap_or_default().to_string();
        
        if name == "file" {
            filename = field.file_name().unwrap_or("unnamed").to_string();
            
            // Generate a staging key in S3
            let staging_key = format!("staging/{}", Uuid::new_v4());
            
            // Convert the field into an AsyncRead stream
            let body_with_io_error = field.map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err));
            let reader = StreamReader::new(body_with_io_error);
            
            // Upload to S3 while hashing on the fly
            let res = state.storage.upload_stream_with_hash(&staging_key, reader).await
                .map_err(|e| {
                    tracing::error!("S3 staging upload failed: {:?}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
                })?;
            
            upload_result = Some(res);
        } else if name == "expiration_hours" {
            let text = field.text().await.unwrap_or_default();
            expiration_hours = text.parse().ok();
        }
    }

    let upload = upload_result.ok_or((StatusCode::BAD_REQUEST, "No file provided".to_string()))?;

    // Check for deduplication in DB
    let existing_storage_file = sqlx::query_as::<_, crate::models::StorageFile>(
        "SELECT id, hash, s3_key, size, ref_count FROM storage_files WHERE hash = ?"
    )
    .bind(&upload.hash)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let storage_file_id = if let Some(sf) = existing_storage_file {
        // Deduplication hit!
        // 1. Increment ref_count
        sqlx::query("UPDATE storage_files SET ref_count = ref_count + 1 WHERE id = ?")
            .bind(&sf.id)
            .execute(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        
        // 2. Delete the staging file from S3 (it's redundant)
        let _ = state.storage.delete_file(&upload.s3_key).await;
        
        sf.id
    } else {
        // New unique file!
        let id = Uuid::new_v4().to_string();
        let permanent_key = format!("{}/{}", upload.hash, filename);
        
        // 1. Move staging file to permanent location in S3
        state.storage.copy_object(&upload.s3_key, &permanent_key).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("S3 move failed: {}", e)))?;
        
        // 2. Delete staging file
        let _ = state.storage.delete_file(&upload.s3_key).await;

        // 3. Insert into storage_files
        sqlx::query(
            "INSERT INTO storage_files (id, hash, s3_key, size, ref_count) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&upload.hash)
        .bind(&permanent_key)
        .bind(upload.size)
        .bind(1)
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
