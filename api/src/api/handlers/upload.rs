use crate::api::error::AppError;
use crate::services::upload_service::{
    CompleteUploadRequest, FileResponse, InitUploadRequest, InitUploadResponse,
    PendingSessionResponse, UploadPartResponse,
};
use crate::utils::auth::Claims;
use axum::{
    Extension, Json,
    extract::{Path, State},
};
use uuid::Uuid;

#[utoipa::path(
    post,
    path = "/files/upload/init",
    request_body = InitUploadRequest,
    responses(
        (status = 200, description = "Upload initiated", body = InitUploadResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn init_upload_handler(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<InitUploadRequest>,
) -> Result<Json<InitUploadResponse>, AppError> {
    // let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized("Invalid user ID".to_string()))?;
    let res: InitUploadResponse = state
        .upload_service
        .init_upload(claims.sub, req)
        .await
        .map_err(|e: anyhow::Error| AppError::BadRequest(e.to_string()))?;
    Ok(Json(res))
}

#[utoipa::path(
    get,
    path = "/files/upload/sessions",
    responses(
        (status = 200, description = "Pending upload sessions", body = Vec<PendingSessionResponse>),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn list_pending_sessions_handler(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<PendingSessionResponse>>, AppError> {
    let sessions = state
        .upload_service
        .list_pending_sessions(claims.sub)
        .await
        .map_err(|e: anyhow::Error| AppError::BadRequest(e.to_string()))?;
    Ok(Json(sessions))
}

#[utoipa::path(
    put,
    path = "/files/upload/{upload_id}/chunk/{part_number}",
    request_body(content = Vec<u8>, description = "Chunk data", content_type = "application/octet-stream"),
    params(
        ("upload_id" = String, Path, description = "Upload Session ID"),
        ("part_number" = i32, Path, description = "Part Number (1-based)")
    ),
    responses(
        (status = 200, description = "Chunk uploaded", body = UploadPartResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn upload_chunk_handler(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path((upload_id, part_number)): Path<(String, i32)>,
    body: axum::body::Bytes,
) -> Result<Json<UploadPartResponse>, AppError> {
    // let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized("Invalid user ID".to_string()))?;
    let session_id = Uuid::parse_str(&upload_id)
        .map_err(|_| AppError::BadRequest("Invalid session ID".to_string()))?;

    // Validate size? The service handles part uploading to S3.
    // 10MB chunk is fine in memory.

    let res: UploadPartResponse = state
        .upload_service
        .upload_chunk(claims.sub, session_id, part_number, body.to_vec())
        .await
        .map_err(|e: anyhow::Error| AppError::BadRequest(e.to_string()))?;

    Ok(Json(res))
}

#[utoipa::path(
    post,
    path = "/files/upload/{upload_id}/complete",
    request_body = CompleteUploadRequest,
    params(
        ("upload_id" = String, Path, description = "Upload Session ID")
    ),
    responses(
        (status = 200, description = "Upload completed", body = FileResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn complete_upload_handler(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(upload_id): Path<String>,
    Json(req): Json<CompleteUploadRequest>,
) -> Result<Json<FileResponse>, AppError> {
    // let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized("Invalid user ID".to_string()))?;
    let session_id = Uuid::parse_str(&upload_id)
        .map_err(|_| AppError::BadRequest("Invalid session ID".to_string()))?;

    let res: FileResponse = state
        .upload_service
        .complete_upload(claims.sub, session_id, req)
        .await
        .map_err(|e: anyhow::Error| AppError::BadRequest(e.to_string()))?;

    Ok(Json(res))
}

#[utoipa::path(
    delete,
    path = "/files/upload/{upload_id}",
    params(
        ("upload_id" = String, Path, description = "Upload Session ID")
    ),
    responses(
        (status = 200, description = "Upload aborted"),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn abort_upload_handler(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(upload_id): Path<String>,
) -> Result<axum::http::StatusCode, AppError> {
    // let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized("Invalid user ID".to_string()))?;
    let session_id = Uuid::parse_str(&upload_id)
        .map_err(|_| AppError::BadRequest("Invalid session ID".to_string()))?;

    state
        .upload_service
        .abort_upload(claims.sub, session_id)
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}
