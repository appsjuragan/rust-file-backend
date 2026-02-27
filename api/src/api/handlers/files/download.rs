use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::utils::auth::Claims;
use axum::{
    Extension, Json,
    body::Body,
    extract::{Path, State},
    http::{StatusCode, header},
    response::Response,
};
use chrono::Utc;
use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use uuid::Uuid;

#[utoipa::path(
    get,
    path = "/files/{id}",
    params(
        ("id" = String, Path, description = "User File ID")
    ),
    responses(
        (status = 200, description = "File download stream"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "File not found"),
        (status = 410, description = "File expired")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn download_file(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(file_id): Path<String>,
) -> Result<Response, AppError> {
    // 1. Verify file ownership and existence
    let user_file = UserFiles::find_by_id(file_id.clone())
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound(
            "File not found, access denied, or already deleted".to_string(),
        ))?;

    if user_file.is_folder {
        return Err(AppError::BadRequest("Cannot download a folder".to_string()));
    }

    let storage_file_id = user_file
        .storage_file_id
        .clone()
        .ok_or(AppError::NotFound("Storage file missing".to_string()))?;

    // 2. Check expiration
    if user_file
        .expires_at
        .is_some_and(|expires| Utc::now() > expires)
    {
        return Err(AppError::Gone("File has expired".to_string()));
    }

    // 3. Get storage file
    let storage_file = StorageFiles::find_by_id(storage_file_id)
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Storage file not found".to_string()))?;

    // 4. Security: Check Virus Scan Status
    if matches!(storage_file.scan_status.as_deref(), Some("infected")) {
        tracing::warn!("Blocked access to infected file: {}", file_id);
        return Err(AppError::Forbidden(format!(
            "File is infected with malware: {}",
            storage_file
                .scan_result
                .as_deref()
                .unwrap_or("unknown threat")
        )));
    }

    // 5. Generate presigned URL and redirect (no data through backend memory)
    let (content_type, content_disposition) =
        resolve_file_headers(&user_file.filename, &storage_file);

    let presigned_url = state
        .storage
        .generate_presigned_url_raw(
            &storage_file.s3_key,
            43200, // 12 hours
            &content_type,
            &content_disposition,
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to generate presigned URL: {}", e);
            AppError::Internal("Failed to generate download URL".to_string())
        })?;

    tracing::info!(
        "📎 Presigned redirect for file_id={} user={}",
        file_id,
        claims.sub
    );

    let url = url::Url::parse(&presigned_url).map_err(|e| {
        tracing::error!("Failed to parse presigned URL: {}", e);
        AppError::Internal("Failed to generate download URL".to_string())
    })?;

    // Extract path and query for X-Accel-Redirect
    // Should be /bucket/key?Signature=...
    let path = url.path();
    let query = url.query().unwrap_or("");
    let internal_redirect_uri = format!("/minio_protected{}?{}", path, query);

    tracing::info!(
        "📎 X-Accel-Redirect for file_id={} user={}",
        file_id,
        claims.sub
    );

    Ok(Response::builder()
        .status(StatusCode::OK)
        // Nginx internal redirect
        .header("X-Accel-Redirect", internal_redirect_uri)
        // Content headers for the client
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_DISPOSITION, content_disposition)
        .header(header::CACHE_CONTROL, "private, max-age=31536000") // 1 year cache since it's immutable
        .body(Body::empty())
        .unwrap())
}

#[utoipa::path(
    get,
    path = "/files/{id}/thumbnail",
    params(
        ("id" = String, Path, description = "User File ID")
    ),
    responses(
        (status = 200, description = "File thumbnail stream"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Thumbnail not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn get_thumbnail(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(file_id): Path<String>,
) -> Result<Response, AppError> {
    // 1. Verify file ownership and existence
    let user_file = UserFiles::find_by_id(file_id.clone())
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound(
            "File not found or access denied".to_string(),
        ))?;

    if user_file.is_folder {
        return Err(AppError::BadRequest(
            "Cannot get thumbnail for a folder".to_string(),
        ));
    }

    let storage_file_id = user_file
        .storage_file_id
        .ok_or(AppError::NotFound("Storage file missing".to_string()))?;

    // 2. Get storage file
    let storage_file = StorageFiles::find_by_id(storage_file_id.clone())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Storage file not found".to_string()))?;

    if !storage_file.has_thumbnail {
        return Err(AppError::NotFound(
            "Thumbnail not generated yet".to_string(),
        ));
    }

    // 3. Generate presigned URL for proxy
    let thumbnail_key = format!("thumbnails/{}.webp", storage_file_id);
    let presigned_url = state
        .storage
        .generate_presigned_url_raw(
            &thumbnail_key,
            43200, // 12 hours
            "image/webp",
            "inline",
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to generate presigned URL for thumbnail: {}", e);
            AppError::Internal("Failed to generate thumbnail URL".to_string())
        })?;

    let url = url::Url::parse(&presigned_url).map_err(|e| {
        tracing::error!("Failed to parse presigned URL: {}", e);
        AppError::Internal("Failed to generate thumbnail URL".to_string())
    })?;

    let path = url.path();
    let query = url.query().unwrap_or("");
    let internal_redirect_uri = format!("/minio_protected{}?{}", path, query);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("X-Accel-Redirect", internal_redirect_uri)
        .header(axum::http::header::CONTENT_TYPE, "image/webp")
        .header(axum::http::header::CACHE_CONTROL, "public, max-age=3600")
        .body(Body::empty())
        .unwrap())
}

#[utoipa::path(
    post,
    path = "/files/{id}/ticket",
    params(
        ("id" = String, Path, description = "File ID")
    ),
    responses(
        (status = 200, description = "Ticket generated"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "File not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn generate_download_ticket(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(file_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_file = UserFiles::find_by_id(file_id.clone())
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("File not found".to_string()))?;

    // Generate ticket for backward compat
    let ticket = Uuid::new_v4().to_string();
    let expiry = Utc::now() + chrono::Duration::hours(12);

    state
        .download_tickets
        .insert(ticket.clone(), (file_id.clone(), expiry));

    // Generate presigned URL (12 hours)
    let storage_file_id = user_file
        .storage_file_id
        .clone()
        .ok_or(AppError::NotFound("Storage file missing".to_string()))?;

    let storage_file = StorageFiles::find_by_id(storage_file_id)
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Storage file not found".to_string()))?;

    // Check virus scan
    if matches!(storage_file.scan_status.as_deref(), Some("infected")) {
        return Err(AppError::Forbidden(format!(
            "File is infected with malware: {}",
            storage_file
                .scan_result
                .as_deref()
                .unwrap_or("unknown threat")
        )));
    }

    let (_content_type, _content_disposition) =
        resolve_file_headers(&user_file.filename, &storage_file);

    // Generate a public URL pointing to the download endpoint with ticket
    let public_url = format!("/api/download/{}", ticket);

    tracing::info!(
        "📎 Ticket generated for file_id={} user={}",
        file_id,
        claims.sub
    );

    Ok(Json(serde_json::json!({
        "ticket": ticket,
        "url": public_url,
        "expires_at": expiry
    })))
}

#[utoipa::path(
    get,
    path = "/download/{ticket}",
    params(
        ("ticket" = String, Path, description = "Download Ticket")
    ),
    responses(
        (status = 200, description = "File stream"),
        (status = 403, description = "Invalid/Expired ticket")
    )
)]
pub async fn download_file_with_ticket(
    State(state): State<crate::AppState>,
    Path(ticket): Path<String>,
) -> Result<Response, AppError> {
    let (file_id, _) = {
        if let Some(entry) = state.download_tickets.get(&ticket) {
            let (fid, exp) = entry.value();
            if *exp < Utc::now() {
                return Err(AppError::Forbidden("Ticket expired".to_string()));
            }
            (fid.clone(), *exp)
        } else {
            return Err(AppError::Forbidden("Invalid ticket".to_string()));
        }
    };

    let user_file = UserFiles::find_by_id(file_id.clone())
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("File not found or deleted".to_string()))?;

    if user_file.is_folder {
        return Err(AppError::BadRequest("Cannot download a folder".to_string()));
    }

    let storage_file_id = user_file
        .storage_file_id
        .clone()
        .ok_or(AppError::NotFound("Storage file missing".to_string()))?;

    if user_file
        .expires_at
        .is_some_and(|expires| Utc::now() > expires)
    {
        return Err(AppError::Gone("File has expired".to_string()));
    }

    let storage_file = StorageFiles::find_by_id(storage_file_id)
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Storage file not found".to_string()))?;

    if matches!(storage_file.scan_status.as_deref(), Some("infected")) {
        return Err(AppError::Forbidden(format!(
            "File is infected with malware: {}",
            storage_file
                .scan_result
                .as_deref()
                .unwrap_or("unknown threat")
        )));
    }

    // Generate presigned URL and redirect
    let (content_type, content_disposition) =
        resolve_file_headers(&user_file.filename, &storage_file);

    let presigned_url = state
        .storage
        .generate_presigned_url_raw(
            &storage_file.s3_key,
            43200, // 12 hours
            &content_type,
            &content_disposition,
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to generate presigned URL: {}", e);
            AppError::Internal("Failed to generate download URL".to_string())
        })?;

    let url = url::Url::parse(&presigned_url).map_err(|e| {
        tracing::error!("Failed to parse presigned URL: {}", e);
        AppError::Internal("Failed to generate download URL".to_string())
    })?;

    // Extract path and query for X-Accel-Redirect
    // Should be /bucket/key?Signature=...
    let path = url.path();
    let query = url.query().unwrap_or("");
    let internal_redirect_uri = format!("/minio_protected{}?{}", path, query);

    Ok(Response::builder()
        .status(StatusCode::OK)
        // Nginx internal redirect
        .header("X-Accel-Redirect", internal_redirect_uri)
        // Content headers for the client
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_DISPOSITION, content_disposition)
        // Cache for ticket duration approx? Or strict validation.
        // We'll trust the browser cache for a bit if needed.
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .body(Body::empty())
        .unwrap())
}

/// Resolve content-type and content-disposition for a file.
pub(crate) fn resolve_file_headers(
    filename: &str,
    storage_file: &crate::entities::storage_files::Model,
) -> (String, String) {
    let mut content_type = storage_file
        .mime_type
        .clone()
        .unwrap_or_else(|| "application/octet-stream".to_string());

    if content_type == "application/octet-stream" || content_type == "application/stream" {
        let extension = filename.split('.').next_back().unwrap_or("").to_lowercase();
        content_type = match extension.as_str() {
            "mp4" => "video/mp4".to_string(),
            "webm" => "video/webm".to_string(),
            "ogg" => "video/ogg".to_string(),
            "mp3" => "audio/mpeg".to_string(),
            "wav" => "audio/wav".to_string(),
            "jpg" | "jpeg" => "image/jpeg".to_string(),
            "png" => "image/png".to_string(),
            "gif" => "image/gif".to_string(),
            "webp" => "image/webp".to_string(),
            "svg" => "image/svg+xml".to_string(),
            "pdf" => "application/pdf".to_string(),
            _ => content_type,
        };
    }

    let ascii_filename = filename
        .chars()
        .filter(|c| c.is_ascii() && !c.is_control() && *c != '"' && *c != '\\' && *c != ';')
        .take(64)
        .collect::<String>();
    let fallback_filename = if ascii_filename.is_empty() {
        "file"
    } else {
        &ascii_filename
    };

    let encoded_filename = utf8_percent_encode(filename, NON_ALPHANUMERIC).to_string();

    let disposition_type = if content_type.starts_with("video/")
        || content_type.starts_with("audio/")
        || content_type.starts_with("image/")
        || content_type == "application/pdf"
        || content_type.starts_with("text/")
    {
        "inline"
    } else {
        "attachment"
    };

    let content_disposition = format!(
        "{}; filename=\"{}\"; filename*=UTF-8''{}",
        disposition_type, fallback_filename, encoded_filename
    );

    (content_type, content_disposition)
}
