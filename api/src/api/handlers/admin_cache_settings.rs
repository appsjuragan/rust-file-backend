use crate::api::error::AppError;
use crate::api::handlers::admin_groups::check_admin;
use crate::entities::{prelude::*, *};
use crate::utils::auth::Claims;
use axum::{
    Extension, Json,
    extract::{Path, State},
};
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

// ─── Response/Request Types ──────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
pub struct CacheSettingsResponse {
    /// Global default TTL (seconds)
    pub default_cache_ttl_seconds: i64,
    /// Per-group overrides
    pub group_overrides: Vec<GroupCacheTtlEntry>,
}

#[derive(Serialize, ToSchema)]
pub struct GroupCacheTtlEntry {
    pub group_id: String,
    pub group_name: String,
    pub cache_ttl_seconds: i32,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateGlobalCacheTtlRequest {
    /// TTL in seconds (60–86400). Set 0 to disable caching for all content.
    pub cache_ttl_seconds: i64,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateGroupCacheTtlRequest {
    /// TTL in seconds (60–86400). Set 0 to disable caching for this group.
    pub cache_ttl_seconds: i32,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Resolve the effective cache TTL for a given user, respecting group overrides.
/// Falls back to the global default (3600s) if no override applies.
pub async fn resolve_cache_ttl(db: &sea_orm::DatabaseConnection, user_id: &str) -> i64 {
    // 1. Find user's group memberships
    let memberships = user_group_members::Entity::find()
        .filter(user_group_members::Column::UserId.eq(user_id))
        .all(db)
        .await
        .unwrap_or_default();

    // 2. For each membership, look for a group cache override (use the lowest TTL — most restrictive)
    let mut group_ttl: Option<i32> = None;
    for member in &memberships {
        if let Ok(Some(override_row)) = group_cache_settings::Entity::find_by_id(&member.group_id)
            .one(db)
            .await
        {
            group_ttl = Some(match group_ttl {
                None => override_row.cache_ttl_seconds,
                Some(existing) => existing.min(override_row.cache_ttl_seconds),
            });
        }
    }

    if let Some(ttl) = group_ttl {
        return ttl as i64;
    }

    // 3. Fall back to global default
    get_global_ttl(db).await
}

/// Read the global default TTL from system_settings, defaulting to 3600.
pub async fn get_global_ttl(db: &sea_orm::DatabaseConnection) -> i64 {
    SystemSettings::find_by_id("default_cache_ttl_seconds")
        .one(db)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.value.parse::<i64>().ok())
        .unwrap_or(3600)
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/// GET /admin/cache-settings — Get global + per-group cache TTL configuration
pub async fn get_cache_settings(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<CacheSettingsResponse>, AppError> {
    check_admin(&state, &claims).await?;

    let global_ttl = get_global_ttl(&state.db).await;

    // Load all group overrides with group names
    let overrides = group_cache_settings::Entity::find()
        .find_also_related(user_groups::Entity)
        .all(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let group_overrides = overrides
        .into_iter()
        .filter_map(|(setting, group)| {
            group.map(|g| GroupCacheTtlEntry {
                group_id: setting.group_id,
                group_name: g.name,
                cache_ttl_seconds: setting.cache_ttl_seconds,
            })
        })
        .collect();

    Ok(Json(CacheSettingsResponse {
        default_cache_ttl_seconds: global_ttl,
        group_overrides,
    }))
}

/// PUT /admin/cache-settings — Update global default cache TTL
pub async fn update_global_cache_ttl(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<UpdateGlobalCacheTtlRequest>,
) -> Result<Json<CacheSettingsResponse>, AppError> {
    check_admin(&state, &claims).await?;

    let ttl = req.cache_ttl_seconds.clamp(0, 86400);

    let row = system_settings::ActiveModel {
        key: Set("default_cache_ttl_seconds".to_string()),
        value: Set(ttl.to_string()),
        description: Set(Some(
            "Default browser cache TTL in seconds for thumbnails and file previews".to_string(),
        )),
        updated_at: Set(Some(Utc::now())),
        updated_by: Set(Some(claims.sub.clone())),
    };

    // Upsert
    SystemSettings::delete_by_id("default_cache_ttl_seconds")
        .exec(&state.db)
        .await
        .ok();
    row.insert(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // Return updated settings
    get_cache_settings(State(state), Extension(claims)).await
}

/// PUT /admin/cache-settings/groups/:group_id — Set or update a group's cache TTL override
pub async fn set_group_cache_ttl(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(group_id): Path<String>,
    Json(req): Json<UpdateGroupCacheTtlRequest>,
) -> Result<Json<CacheSettingsResponse>, AppError> {
    check_admin(&state, &claims).await?;

    // Verify group exists
    UserGroups::find_by_id(&group_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Group not found".to_string()))?;

    let ttl = req.cache_ttl_seconds.clamp(0, 86400);

    // Delete existing override if any, then insert fresh
    group_cache_settings::Entity::delete_by_id(&group_id)
        .exec(&state.db)
        .await
        .ok();

    let row = group_cache_settings::ActiveModel {
        group_id: Set(group_id),
        cache_ttl_seconds: Set(ttl),
        updated_at: Set(Some(Utc::now())),
        updated_by: Set(Some(claims.sub.clone())),
    };
    row.insert(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    get_cache_settings(State(state), Extension(claims)).await
}

/// DELETE /admin/cache-settings/groups/:group_id — Remove a group's override (revert to global)
pub async fn delete_group_cache_override(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(group_id): Path<String>,
) -> Result<Json<CacheSettingsResponse>, AppError> {
    check_admin(&state, &claims).await?;

    group_cache_settings::Entity::delete_by_id(&group_id)
        .exec(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    get_cache_settings(State(state), Extension(claims)).await
}
