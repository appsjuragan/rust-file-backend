use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::utils::auth::Claims;
use axum::{Extension, Json, extract::{Path, State}};
use sea_orm::{ActiveModelTrait, EntityTrait, IntoActiveModel, Set};
use serde::{Deserialize};
use utoipa::ToSchema;

#[derive(Deserialize, ToSchema)]
pub struct UpdateTierSettingsRequest {
    pub tier: String, // "free", "basic", "pro"
    pub quota: i64,
    pub bandwidth: i64,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateUserTierRequest {
    pub tier: String,
}

#[utoipa::path(
    put,
    path = "/admin/tiers",
    request_body = UpdateTierSettingsRequest,
    responses(
        (status = 200, description = "Tier settings updated"),
        (status = 403, description = "Admin access required")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn update_tier_settings(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<UpdateTierSettingsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = Users::find_by_id(claims.sub.clone())
        .one(&state.db)
        .await?
        .ok_or(AppError::Unauthorized("User not found".to_string()))?;
        
    if !user.is_admin {
        return Err(AppError::Forbidden("Admin access required".to_string()));
    }

    let quota_key = format!("quota_{}", req.tier.to_lowercase());
    let bandwidth_key = format!("bandwidth_{}", req.tier.to_lowercase());

    for (key, val) in [(quota_key, req.quota), (bandwidth_key, req.bandwidth)] {
        let setting = system_settings::Entity::find_by_id(key.clone())
            .one(&state.db)
            .await?;
            
        if let Some(s) = setting {
            let mut active = s.into_active_model();
            active.value = Set(val.to_string());
            active.update(&state.db).await?;
        } else {
            let active = system_settings::ActiveModel {
                key: Set(key),
                value: Set(val.to_string()),
                description: Set(Some(format!("Limit for {} tier", req.tier))),
                updated_at: Set(Some(chrono::Utc::now())),
                updated_by: Set(Some(claims.sub.clone())),
            };
            system_settings::Entity::insert(active).exec(&state.db).await?;
        }
    }

    Ok(Json(serde_json::json!({"status": "ok"})))
}

#[utoipa::path(
    put,
    path = "/admin/users/{id}/tier",
    params(
        ("id" = String, Path, description = "User ID")
    ),
    request_body = UpdateUserTierRequest,
    responses(
        (status = 200, description = "User tier updated"),
        (status = 403, description = "Admin access required"),
        (status = 404, description = "User not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn update_user_tier(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(target_user_id): Path<String>,
    Json(req): Json<UpdateUserTierRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let admin = Users::find_by_id(claims.sub)
        .one(&state.db)
        .await?
        .ok_or(AppError::Unauthorized("User not found".to_string()))?;
        
    if !admin.is_admin {
        return Err(AppError::Forbidden("Admin access required".to_string()));
    }

    let user = Users::find_by_id(target_user_id)
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Target user not found".to_string()))?;

    let mut active = user.into_active_model();
    active.tier = Set(req.tier.to_lowercase());
    active.update(&state.db).await?;

    Ok(Json(serde_json::json!({"status": "ok"})))
}
