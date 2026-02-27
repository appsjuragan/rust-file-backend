use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::utils::auth::Claims;
use crate::utils::validation::sanitize_filename;
use axum::{
    Extension, Json,
    extract::{Multipart, State},
};
use futures::TryStreamExt;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use tokio_util::io::StreamReader;
use uuid::Uuid;
use validator::Validate;

use super::types::*;

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
) -> Result<Json<PreCheckResponse>, AppError> {
    req.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let existing = StorageFiles::find()
        .filter(storage_files::Column::Hash.eq(&req.full_hash))
        .filter(storage_files::Column::Size.eq(req.size))
        .one(&state.db)
        .await?;

    if let Some(file) = existing {
        Ok(Json(PreCheckResponse {
            exists: true,
            upload_token: None,
            file_id: Some(file.id),
        }))
    } else {
        Ok(Json(PreCheckResponse {
            exists: false,
            upload_token: Some(Uuid::new_v4().to_string()),
            file_id: None,
        }))
    }
}

#[utoipa::path(
    post,
    path = "/files/link",
    request_body = LinkFileRequest,
    responses(
        (status = 200, description = "File linked successfully", body = UploadResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Storage file not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn link_file(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<LinkFileRequest>,
) -> Result<Json<UploadResponse>, AppError> {
    let rules = crate::utils::validation::ValidationRules::load(
        &state.db,
        state.config.max_file_size,
        state.config.chunk_size,
    )
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load validation rules: {}", e)))?;

    let sanitized_filename = crate::utils::validation::sanitize_filename(&req.filename, &rules)
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let (user_file_id, expires_at) = state
        .file_service
        .link_existing_file(
            req.storage_file_id,
            sanitized_filename.clone(),
            claims.sub,
            req.parent_id,
            req.expiration_hours,
        )
        .await?;

    Ok(Json(UploadResponse {
        file_id: user_file_id,
        filename: req.filename,
        expires_at,
    }))
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
) -> Result<Json<UploadResponse>, AppError> {
    let mut filename = String::new();
    let mut expiration_hours: Option<i64> = None;
    let mut parent_id: Option<String> = None;
    let mut total_size: Option<u64> = None;
    let mut staged_file: Option<crate::services::file_service::StagedFile> = None;

    // Use a result to capture errors so we can consume the multipart stream if needed
    let result: Result<Json<UploadResponse>, AppError> = async {
        while let Some(field) = multipart.next_field().await.map_err(|e| {
            let err_msg = e.to_string();
            if err_msg.contains("length limit exceeded") {
                AppError::PayloadTooLarge(
                    "Request body exceeds the maximum allowed limit".to_string(),
                )
            } else {
                AppError::BadRequest(err_msg)
            }
        })? {
            let name = field.name().unwrap_or_default().to_string();

            if name == "file" {
                let original_filename = field.file_name().unwrap_or("unnamed").to_string();
                let content_type = field.content_type().map(|s| s.to_string());

                // 0. Load Validation Rules
                let rules = crate::utils::validation::ValidationRules::load(
                    &state.db,
                    state.config.max_file_size,
                    state.config.chunk_size,
                )
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Failed to load validation rules: {}", e))
                })?;

                // 1. Sanitize filename
                filename = sanitize_filename(&original_filename, &rules)
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;

                // 2. Create reader
                let body_with_io_error = field.map_err(std::io::Error::other);
                let reader = StreamReader::new(body_with_io_error);

                // 3. Upload to Staging
                staged_file = Some(
                    state
                        .file_service
                        .upload_to_staging(&filename, content_type.as_deref(), reader)
                        .await?,
                );
            } else if name == "expiration_hours" {
                let text = field.text().await.unwrap_or_default();
                expiration_hours = text.parse().ok();
            } else if name == "parent_id" {
                let text = field.text().await.unwrap_or_default();
                if !text.is_empty() && text != "null" {
                    parent_id = Some(text);
                }
            } else if name == "total_size" {
                let text = field.text().await.unwrap_or_default();
                total_size = text.parse().ok();
            }
        }

        let staged = staged_file.ok_or(AppError::BadRequest("No file provided".to_string()))?;

        // 4. Process Upload
        let (user_file_id, expires_at) = state
            .file_service
            .process_upload(
                staged,
                filename.clone(),
                claims.sub,
                parent_id,
                expiration_hours,
                total_size,
            )
            .await?;

        Ok(Json(UploadResponse {
            file_id: user_file_id,
            filename,
            expires_at,
        }))
    }
    .await;

    match result {
        Ok(res) => Ok(res),
        Err(e) => {
            // CRITICAL: Consume the remaining multipart stream to avoid TCP reset ("Network error" in browser)
            // This is especially important for restricted files or large files rejected early
            tracing::warn!("Upload failed early: {}. Consuming remaining stream...", e);
            while let Ok(Some(mut field)) = multipart.next_field().await {
                while let Ok(Some(_)) = field.chunk().await {}
            }
            Err(e)
        }
    }
}
