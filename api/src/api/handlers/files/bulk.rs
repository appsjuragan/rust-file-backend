use crate::api::error::AppError;
use crate::services::audit::{AuditEventType, AuditService};
use crate::utils::auth::Claims;
use axum::{Extension, Json, extract::State};

use super::types::*;

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
    if req.item_ids.is_empty() {
        return Err(AppError::BadRequest("No items provided".to_string()));
    }

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
    if req.item_ids.is_empty() {
        return Err(AppError::BadRequest("No items provided".to_string()));
    }

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
    if req.item_ids.is_empty() {
        return Err(AppError::BadRequest("No items provided".to_string()));
    }

    let copied_count = state
        .file_service
        .bulk_copy(&claims.sub, req.item_ids, req.parent_id)
        .await?;

    Ok(Json(BulkCopyResponse { copied_count }))
}
