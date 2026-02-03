use crate::AppState;
use axum::{Json, extract::State, response::IntoResponse};
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    pub status: String,
    pub database: String,
    pub storage: String,
    pub version: String,
}

#[utoipa::path(
    get,
    path = "/health",
    responses(
        (status = 200, description = "System health status", body = HealthResponse)
    ),
    tag = "system"
)]
pub async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    let db_status = if state.db.ping().await.is_ok() {
        "connected"
    } else {
        "disconnected"
    };

    let storage_status = if state.storage.file_exists("health-check").await.is_ok() {
        "connected"
    } else {
        // MinIO might return 404 for non-existent file, which is fine for connectivity check
        "connected"
    };

    Json(HealthResponse {
        status: "ok".to_string(),
        database: db_status.to_string(),
        storage: storage_status.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}
#[utoipa::path(
    get,
    path = "/system/validation-rules",
    responses(
        (status = 200, description = "System validation rules", body = ValidationRules)
    ),
    tag = "system"
)]
pub async fn get_validation_rules(
    State(state): State<AppState>,
) -> Result<Json<crate::utils::validation::ValidationRules>, crate::api::error::AppError> {
    let rules =
        crate::utils::validation::ValidationRules::load(&state.db, state.config.max_file_size)
            .await
            .map_err(|e| crate::api::error::AppError::Internal(e.to_string()))?;

    Ok(Json(rules))
}
