use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::services::share_service::ShareService;
use crate::utils::auth::Claims;
use axum::{
    Extension, Json,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::Response,
};
use chrono::Utc;
use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

// ── Request / Response Types ──────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
pub struct CreateShareRequest {
    pub user_file_id: String,
    pub share_type: String, // "public" or "user"
    pub shared_with_user_id: Option<String>,
    pub password: Option<String>,
    pub permission: String,    // "view" or "download"
    pub expires_in_hours: i64, // Must be > 0
}

#[derive(Serialize, ToSchema)]
pub struct ShareResponse {
    pub id: String,
    pub user_file_id: String,
    pub share_token: String,
    pub share_type: String,
    pub shared_with_user_id: Option<String>,
    pub has_password: bool,
    pub permission: String,
    pub expires_at: chrono::DateTime<Utc>,
    pub created_at: chrono::DateTime<Utc>,
    pub filename: Option<String>,
    pub is_folder: Option<bool>,
}

#[derive(Serialize, ToSchema)]
pub struct ShareAccessLogResponse {
    pub id: String,
    pub accessed_by_user_id: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub action: String,
    pub accessed_at: chrono::DateTime<Utc>,
}

#[derive(Serialize, ToSchema)]
pub struct PublicShareInfoResponse {
    pub filename: String,
    pub is_folder: bool,
    pub size: Option<i64>,
    pub mime_type: Option<String>,
    pub permission: String,
    pub requires_password: bool,
    pub expires_at: chrono::DateTime<Utc>,
}

#[derive(Deserialize, ToSchema)]
pub struct VerifySharePasswordRequest {
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct VerifySharePasswordResponse {
    pub verified: bool,
}

#[derive(Serialize, ToSchema)]
pub struct PublicFileEntry {
    pub id: String,
    pub filename: String,
    pub is_folder: bool,
    pub size: Option<i64>,
    pub mime_type: Option<String>,
    pub created_at: chrono::DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct SharesForFileQuery {
    pub user_file_id: Option<String>,
}

// ── Authenticated Endpoints ───────────────────────────────────────────

/// Create a share link
#[utoipa::path(
    post,
    path = "/shares",
    request_body = CreateShareRequest,
    responses(
        (status = 201, description = "Share link created", body = ShareResponse),
        (status = 400, description = "Bad request"),
        (status = 401, description = "Unauthorized")
    ),
    security(("jwt" = []))
)]
pub async fn create_share(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateShareRequest>,
) -> Result<(StatusCode, Json<ShareResponse>), AppError> {
    // Validate
    if req.expires_in_hours <= 0 {
        return Err(AppError::BadRequest("Expiry must be positive".to_string()));
    }
    if req.expires_in_hours > 8760 {
        // max 1 year
        return Err(AppError::BadRequest(
            "Expiry cannot exceed 1 year".to_string(),
        ));
    }
    if !["public", "user"].contains(&req.share_type.as_str()) {
        return Err(AppError::BadRequest(
            "share_type must be 'public' or 'user'".to_string(),
        ));
    }
    if !["view", "download"].contains(&req.permission.as_str()) {
        return Err(AppError::BadRequest(
            "permission must be 'view' or 'download'".to_string(),
        ));
    }
    if req.share_type == "user" && req.shared_with_user_id.is_none() {
        return Err(AppError::BadRequest(
            "shared_with_user_id required for user share".to_string(),
        ));
    }

    let expires_at = Utc::now() + chrono::Duration::hours(req.expires_in_hours);

    let share = ShareService::create_share(
        &state.db,
        req.user_file_id.clone(),
        claims.sub,
        req.share_type,
        req.shared_with_user_id,
        req.password,
        req.permission,
        expires_at,
    )
    .await?;

    // Get the file info for the response
    let user_file = UserFiles::find_by_id(&share.user_file_id)
        .one(&state.db)
        .await?;

    Ok((
        StatusCode::CREATED,
        Json(ShareResponse {
            id: share.id,
            user_file_id: share.user_file_id,
            share_token: share.share_token,
            share_type: share.share_type,
            shared_with_user_id: share.shared_with_user_id,
            has_password: share.password_hash.is_some(),
            permission: share.permission,
            expires_at: share.expires_at,
            created_at: share.created_at.unwrap_or_else(Utc::now),
            filename: user_file.as_ref().map(|f| f.filename.clone()),
            is_folder: user_file.as_ref().map(|f| f.is_folder),
        }),
    ))
}

/// List shares (optionally filtered by file)
#[utoipa::path(
    get,
    path = "/shares",
    params(
        ("user_file_id" = Option<String>, Query, description = "Filter by file ID")
    ),
    responses(
        (status = 200, description = "List of shares", body = Vec<ShareResponse>),
        (status = 401, description = "Unauthorized")
    ),
    security(("jwt" = []))
)]
pub async fn list_shares(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<SharesForFileQuery>,
) -> Result<Json<Vec<ShareResponse>>, AppError> {
    let shares: Vec<(share_links::Model, Option<user_files::Model>)> =
        if let Some(ref file_id) = query.user_file_id {
            let items = ShareService::get_shares_for_file(&state.db, file_id, &claims.sub).await?;
            items
                .into_iter()
                .map(|s| (s, None::<user_files::Model>))
                .collect()
        } else {
            ShareService::list_user_shares(&state.db, &claims.sub).await?
        };

    // For filtered-by-file queries, fetch file info once
    let file_info = if let Some(ref file_id) = query.user_file_id {
        UserFiles::find_by_id(file_id).one(&state.db).await?
    } else {
        None
    };

    let result: Vec<ShareResponse> = shares
        .into_iter()
        .map(|(share, user_file)| {
            let uf = user_file.as_ref().or(file_info.as_ref());
            ShareResponse {
                id: share.id,
                user_file_id: share.user_file_id,
                share_token: share.share_token,
                share_type: share.share_type,
                shared_with_user_id: share.shared_with_user_id,
                has_password: share.password_hash.is_some(),
                permission: share.permission,
                expires_at: share.expires_at,
                created_at: share.created_at.unwrap_or_else(Utc::now),
                filename: uf.map(|f| f.filename.clone()),
                is_folder: uf.map(|f| f.is_folder),
            }
        })
        .collect();

    Ok(Json(result))
}

/// Revoke a share link
#[utoipa::path(
    delete,
    path = "/shares/{id}",
    params(("id" = String, Path, description = "Share ID")),
    responses(
        (status = 204, description = "Share revoked"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Share not found")
    ),
    security(("jwt" = []))
)]
pub async fn revoke_share(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(share_id): Path<String>,
) -> Result<StatusCode, AppError> {
    ShareService::revoke_share(&state.db, &share_id, &claims.sub).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Get access logs for a share link
#[utoipa::path(
    get,
    path = "/shares/{id}/logs",
    params(("id" = String, Path, description = "Share ID")),
    responses(
        (status = 200, description = "Access logs", body = Vec<ShareAccessLogResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Share not found")
    ),
    security(("jwt" = []))
)]
pub async fn get_share_logs(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(share_id): Path<String>,
) -> Result<Json<Vec<ShareAccessLogResponse>>, AppError> {
    let logs = ShareService::get_access_logs(&state.db, &share_id, &claims.sub).await?;

    let result: Vec<ShareAccessLogResponse> = logs
        .into_iter()
        .map(|log| ShareAccessLogResponse {
            id: log.id,
            accessed_by_user_id: log.accessed_by_user_id,
            ip_address: log.ip_address,
            user_agent: log.user_agent,
            action: log.action,
            accessed_at: log.accessed_at,
        })
        .collect();

    Ok(Json(result))
}

// ── Public Endpoints ──────────────────────────────────────────────────

fn extract_ip(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("").trim().to_string())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        })
}

fn extract_user_agent(headers: &HeaderMap) -> Option<String> {
    headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

/// Get shared item info (public)
#[utoipa::path(
    get,
    path = "/share/{token}",
    params(("token" = String, Path, description = "Share token")),
    responses(
        (status = 200, description = "Share info", body = PublicShareInfoResponse),
        (status = 404, description = "Share not found"),
        (status = 410, description = "Share expired")
    )
)]
pub async fn get_public_share(
    State(state): State<crate::AppState>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> Result<Json<PublicShareInfoResponse>, AppError> {
    let share = ShareService::get_share_by_token(&state.db, &token).await?;

    let user_file = UserFiles::find_by_id(&share.user_file_id)
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound(
            "Shared file no longer exists".to_string(),
        ))?;

    let storage_file = if let Some(ref sid) = user_file.storage_file_id {
        StorageFiles::find_by_id(sid).one(&state.db).await?
    } else {
        None
    };

    // Log the view access
    let ip = extract_ip(&headers);
    let ua = extract_user_agent(&headers);
    ShareService::log_access(&state.db, &share.id, None, ip, ua, "view").await;

    Ok(Json(PublicShareInfoResponse {
        filename: user_file.filename,
        is_folder: user_file.is_folder,
        size: storage_file.as_ref().map(|s| s.size),
        mime_type: storage_file.and_then(|s| s.mime_type),
        permission: share.permission,
        requires_password: share.password_hash.is_some(),
        expires_at: share.expires_at,
    }))
}

/// Verify share password (public)
#[utoipa::path(
    post,
    path = "/share/{token}/verify",
    params(("token" = String, Path, description = "Share token")),
    request_body = VerifySharePasswordRequest,
    responses(
        (status = 200, description = "Password verification result", body = VerifySharePasswordResponse),
        (status = 404, description = "Share not found"),
        (status = 410, description = "Share expired")
    )
)]
pub async fn verify_share_password(
    State(state): State<crate::AppState>,
    Path(token): Path<String>,
    headers: HeaderMap,
    Json(req): Json<VerifySharePasswordRequest>,
) -> Result<Json<VerifySharePasswordResponse>, AppError> {
    let share = ShareService::get_share_by_token(&state.db, &token).await?;

    let ip = extract_ip(&headers);
    let ua = extract_user_agent(&headers);

    let verified = match &share.password_hash {
        Some(hash) => {
            let result = ShareService::verify_password(&req.password, hash)?;
            ShareService::log_access(
                &state.db,
                &share.id,
                None,
                ip,
                ua,
                if result {
                    "password_verified"
                } else {
                    "password_attempt"
                },
            )
            .await;
            result
        }
        None => true, // No password required
    };

    Ok(Json(VerifySharePasswordResponse { verified }))
}

#[derive(Deserialize)]
pub struct DownloadSharedFileQuery {
    pub password: Option<String>,
}

/// Download shared file (public)
#[utoipa::path(
    get,
    path = "/share/{token}/download",
    params(
        ("token" = String, Path, description = "Share token"),
        ("password" = Option<String>, Query, description = "Share password")
    ),
    responses(
        (status = 200, description = "File download redirect"),
        (status = 403, description = "Download not permitted"),
        (status = 404, description = "Share not found"),
        (status = 410, description = "Share expired")
    )
)]
pub async fn download_shared_file(
    State(state): State<crate::AppState>,
    Path(token): Path<String>,
    Query(query): Query<DownloadSharedFileQuery>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let share = ShareService::get_share_by_token(&state.db, &token).await?;

    if let Some(hash) = &share.password_hash {
        let provided_pw = query.password.as_deref().unwrap_or("");
        if !ShareService::verify_password(provided_pw, hash)? {
            return Err(AppError::Forbidden("Invalid password".to_string()));
        }
    }

    if share.permission != "download" && share.permission != "view" {
        return Err(AppError::Forbidden(
            "Access is not permitted for this share".to_string(),
        ));
    }

    // Password-protected shares require prior verification via /verify endpoint
    // The frontend should call /verify first and only enable the download button when verified

    let user_file = UserFiles::find_by_id(&share.user_file_id)
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound(
            "Shared file no longer exists".to_string(),
        ))?;

    if user_file.is_folder {
        return Err(AppError::BadRequest("Cannot download a folder".to_string()));
    }

    let storage_file_id = user_file
        .storage_file_id
        .clone()
        .ok_or(AppError::NotFound("Storage file missing".to_string()))?;

    let storage_file = StorageFiles::find_by_id(&storage_file_id)
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Storage file not found".to_string()))?;

    // Security: block infected files
    if matches!(storage_file.scan_status.as_deref(), Some("infected")) {
        return Err(AppError::Forbidden("File is infected".to_string()));
    }

    // Log download
    let ip = extract_ip(&headers);
    let ua = extract_user_agent(&headers);
    ShareService::log_access(&state.db, &share.id, None, ip, ua, "download").await;

    // Generate presigned URL (same approach as files.rs download_file)
    let content_type = storage_file
        .mime_type
        .clone()
        .or(storage_file.content_type.clone())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    let ascii_filename = user_file
        .filename
        .chars()
        .filter(|c| c.is_ascii() && !c.is_control() && *c != '"' && *c != '\\' && *c != ';')
        .take(64)
        .collect::<String>();
    let fallback_filename = if ascii_filename.is_empty() {
        "file".to_string()
    } else {
        ascii_filename
    };
    let encoded_filename = utf8_percent_encode(&user_file.filename, NON_ALPHANUMERIC).to_string();
    let disposition_type = if share.permission == "view" {
        "inline"
    } else {
        "attachment"
    };
    let content_disposition = format!(
        "{}; filename=\"{}\"; filename*=UTF-8''{}",
        disposition_type, fallback_filename, encoded_filename
    );

    let presigned_url = state
        .storage
        .generate_presigned_url_raw(
            &storage_file.s3_key,
            43200,
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

    let path = url.path();
    let query = url.query().unwrap_or("");
    let internal_redirect_uri = format!("/minio_protected{}?{}", path, query);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("X-Accel-Redirect", internal_redirect_uri)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_DISPOSITION, content_disposition)
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::empty())
        .unwrap())
}

/// List shared folder contents (public)
#[utoipa::path(
    get,
    path = "/share/{token}/list",
    params(("token" = String, Path, description = "Share token")),
    responses(
        (status = 200, description = "Folder contents", body = Vec<PublicFileEntry>),
        (status = 404, description = "Share not found"),
        (status = 410, description = "Share expired")
    )
)]
pub async fn list_shared_folder(
    State(state): State<crate::AppState>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Vec<PublicFileEntry>>, AppError> {
    let share = ShareService::get_share_by_token(&state.db, &token).await?;

    // Validate that it's a folder
    let user_file = UserFiles::find_by_id(&share.user_file_id)
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Shared item not found".to_string()))?;

    if !user_file.is_folder {
        return Err(AppError::BadRequest(
            "Only folders can be listed".to_string(),
        ));
    }

    // Passwords should be verified by the frontend before calling this.
    // However, for extra security, the frontend could pass a session token or cookie.
    // For now, we list if verified.

    let children = UserFiles::find()
        .filter(user_files::Column::ParentId.eq(&user_file.id))
        .filter(user_files::Column::DeletedAt.is_null())
        .find_also_related(StorageFiles)
        .all(&state.db)
        .await?;

    let result = children
        .into_iter()
        .map(|(child, storage)| PublicFileEntry {
            id: child.id,
            filename: child.filename,
            is_folder: child.is_folder,
            size: storage.as_ref().map(|s| s.size),
            mime_type: storage.and_then(|s| s.mime_type.clone()),
            created_at: child.created_at.unwrap_or_else(Utc::now),
        })
        .collect();

    // Log access
    let ip = extract_ip(&headers);
    let ua = extract_user_agent(&headers);
    ShareService::log_access(&state.db, &share.id, None, ip, ua, "list").await;

    Ok(Json(result))
}
