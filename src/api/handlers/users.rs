use crate::api::error::AppError;
use crate::utils::auth::Claims;
use axum::{Extension, Json, extract::State};
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct RotateKeyResponse {
    pub message: String,
}

#[utoipa::path(
    post,
    path = "/users/keys/rotate",
    responses(
        (status = 200, description = "Keys rotated successfully", body = RotateKeyResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn rotate_keys(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<RotateKeyResponse>, AppError> {
    state
        .key_service
        .rotate_user_key(&claims.sub)
        .await
        .map_err(|e| AppError::Internal(format!("Key rotation failed: {}", e)))?;

    Ok(Json(RotateKeyResponse {
        message: "User keys rotated successfully. All files have been re-keyed.".to_string(),
    }))
}
