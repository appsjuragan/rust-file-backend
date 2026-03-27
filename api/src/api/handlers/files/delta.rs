use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::utils::auth::Claims;
use axum::{
    Extension, Json,
    extract::{Query, State},
};
use chrono::{DateTime, Utc};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use serde::Deserialize;

use super::types::FileMetadataResponse;
use super::manage::return_file_metadata;

#[derive(Deserialize)]
pub struct DeltaQuery {
    pub since: DateTime<Utc>,
}

#[utoipa::path(
    get,
    path = "/files/delta",
    params(
        ("since" = DateTime<Utc>, Query, description = "Fetch changes since this timestamp")
    ),
    responses(
        (status = 200, description = "List of changed files", body = Vec<FileMetadataResponse>),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn get_delta(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<DeltaQuery>,
) -> Result<Json<Vec<FileMetadataResponse>>, AppError> {
    // 1. Find all files updated OR deleted since the given timestamp
    // We include deleted_at to notify the client about deletions.
    let changed_files = UserFiles::find()
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(
            sea_orm::Condition::any()
                .add(user_files::Column::UpdatedAt.gt(query.since))
                .add(user_files::Column::DeletedAt.gt(query.since))
        )
        .order_by_asc(user_files::Column::UpdatedAt)
        .all(&state.db)
        .await?;

    let mut results = Vec::new();
    for file in changed_files {
        // For deleted files, return_file_metadata might need care if the storage file is gone
        // but since we soft-delete, it should generally be fine for a delta update.
        match return_file_metadata(state.clone(), file).await {
            Ok(Json(meta)) => results.push(meta),
            Err(e) => tracing::warn!("Failed to get metadata for delta item: {}", e),
        }
    }

    Ok(Json(results))
}
