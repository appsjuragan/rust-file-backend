use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::utils::auth::Claims;
use axum::{Extension, Json, extract::State};
use chrono::Utc;
use sea_orm::{ActiveModelTrait, EntityTrait, IntoActiveModel, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, ToSchema, Clone)]
pub struct UserSettingsResponse {
    pub theme: String,
    pub view_style: String,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateUserSettingsRequest {
    pub theme: Option<String>,
    pub view_style: Option<String>,
}

#[utoipa::path(
    get,
    path = "/settings",
    responses(
        (status = 200, description = "Get user settings", body = UserSettingsResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn get_settings(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<UserSettingsResponse>, AppError> {
    let settings = UserSettings::find_by_id(claims.sub.clone())
        .one(&state.db)
        .await?;

    if let Some(settings) = settings {
        Ok(Json(UserSettingsResponse {
            theme: settings.theme,
            view_style: settings.view_style,
        }))
    } else {
        // Check if user exists first to avoid FK constraint failure
        let user_exists = Users::find_by_id(claims.sub.clone())
            .one(&state.db)
            .await?
            .is_some();

        if !user_exists {
            return Err(AppError::Unauthorized(
                "User account no longer exists".to_string(),
            ));
        }

        // Create default settings if not found
        let new_settings = user_settings::ActiveModel {
            user_id: Set(claims.sub.clone()),
            theme: Set("dark".to_string()),
            view_style: Set("list".to_string()),
            created_at: Set(Utc::now()),
            updated_at: Set(Utc::now()),
        };

        let res = new_settings.insert(&state.db).await?;

        Ok(Json(UserSettingsResponse {
            theme: res.theme,
            view_style: res.view_style,
        }))
    }
}

#[utoipa::path(
    put,
    path = "/settings",
    request_body = UpdateUserSettingsRequest,
    responses(
        (status = 200, description = "Update user settings", body = UserSettingsResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn update_settings(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<UpdateUserSettingsRequest>,
) -> Result<Json<UserSettingsResponse>, AppError> {
    let settings = UserSettings::find_by_id(claims.sub.clone())
        .one(&state.db)
        .await?;

    let res = if let Some(settings) = settings {
        let mut active_model = settings.into_active_model();
        if let Some(theme) = req.theme {
            active_model.theme = Set(theme);
        }
        if let Some(view_style) = req.view_style {
            active_model.view_style = Set(view_style);
        }
        active_model.updated_at = Set(Utc::now());
        active_model.update(&state.db).await?
    } else {
        // Check if user exists first to avoid FK constraint failure
        let user_exists = Users::find_by_id(claims.sub.clone())
            .one(&state.db)
            .await?
            .is_some();

        if !user_exists {
            return Err(AppError::Unauthorized(
                "User account no longer exists".to_string(),
            ));
        }

        let active_model = user_settings::ActiveModel {
            user_id: Set(claims.sub.clone()),
            theme: Set(req.theme.unwrap_or("dark".to_string())),
            view_style: Set(req.view_style.unwrap_or("list".to_string())),
            created_at: Set(Utc::now()),
            updated_at: Set(Utc::now()),
        };
        active_model.insert(&state.db).await?
    };

    Ok(Json(UserSettingsResponse {
        theme: res.theme,
        view_style: res.view_style,
    }))
}
