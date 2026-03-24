use crate::api::error::AppError;
use crate::services::audit::{AuditEventType, AuditService};
use crate::utils::auth::Claims;
use axum::{Extension, Json, extract::{State, Path}};

use super::types::*;

use validator::Validate;

#[utoipa::path(
    post,
    path = "/files/bulk-delete",
    request_body = BulkDeleteRequest,
    responses(
        (status = 200, description = "Items deleted", body = BulkDeleteResponse),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Bad request")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn bulk_delete(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<BulkDeleteRequest>,
) -> Result<Json<BulkDeleteResponse>, AppError> {
    req.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;

    let item_ids_for_audit = req.item_ids.clone();
    let deleted_count = state
        .file_service
        .bulk_delete(&claims.sub, req.item_ids)
        .await?;

    // Audit log
    let audit = AuditService::new(state.db.clone());
    audit
        .log(
            AuditEventType::FileDelete,
            Some(claims.sub),
            None,
            "bulk_delete",
            "success",
            Some(serde_json::json!({
                "item_ids": item_ids_for_audit,
                "deleted_count": deleted_count
            })),
            None,
        )
        .await;

    Ok(Json(BulkDeleteResponse { deleted_count }))
}

#[utoipa::path(
    post,
    path = "/files/bulk-move",
    request_body = BulkMoveRequest,
    responses(
        (status = 200, description = "Items moved", body = BulkMoveResponse),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Bad request")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn bulk_move(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<BulkMoveRequest>,
) -> Result<Json<BulkMoveResponse>, AppError> {
    req.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;

    let moved_count = state
        .file_service
        .bulk_move(&claims.sub, req.item_ids, req.parent_id)
        .await?;

    Ok(Json(BulkMoveResponse { moved_count }))
}

#[utoipa::path(
    post,
    path = "/files/bulk-copy",
    request_body = BulkMoveRequest,
    responses(
        (status = 200, description = "Items copied", body = BulkCopyResponse),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Bad request")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn bulk_copy(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<BulkMoveRequest>,
) -> Result<Json<BulkCopyResponse>, AppError> {
    req.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;

    let copied_count = state
        .file_service
        .bulk_copy(&claims.sub, req.item_ids, req.parent_id)
        .await?;

    Ok(Json(BulkCopyResponse { copied_count }))
}

#[utoipa::path(
    post,
    path = "/files/bulk-download",
    request_body = BulkDownloadRequest,
    responses(
        (status = 200, description = "Archive creation queued", body = BulkDownloadResponse),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Bad request")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn bulk_download(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<BulkDownloadRequest>,
) -> Result<Json<BulkDownloadResponse>, AppError> {
    req.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;

    let archive_id = state
        .file_service
        .create_archive(&claims.sub, req.item_ids)
        .await?;

    Ok(Json(BulkDownloadResponse { archive_id }))
}

#[utoipa::path(
    get,
    path = "/files/archive/{id}/status",
    params(
        ("id" = String, Path, description = "Archive ID")
    ),
    responses(
        (status = 200, description = "Archive status", body = ArchiveStatusResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn get_archive_status(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<Json<ArchiveStatusResponse>, AppError> {
    // Basic format validation
    if id.len() != 36 {
        return Err(AppError::BadRequest("Invalid archive ID format".to_string()));
    }
    let mut status = state.file_service.get_archive_status(&claims.sub, &id).await?;
    if status.status == "ready" {
        let ticket = uuid::Uuid::new_v4().to_string();
        let expiry = chrono::Utc::now() + chrono::Duration::hours(12);
        state.download_tickets.insert(
            ticket.clone(),
            (format!("archive_{}", id), expiry),
        );
        status.url = Some(format!("/api/download/{}", ticket));
    }
    Ok(Json(status))
}
