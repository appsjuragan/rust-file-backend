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
    pub trash_cleanup_days: i32,
    pub has_lock_passphrase: bool,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateUserSettingsRequest {
    pub theme: Option<String>,
    pub view_style: Option<String>,
    pub trash_cleanup_days: Option<i32>,
}

#[derive(Deserialize, ToSchema)]
pub struct SetLockPassphraseRequest {
    pub passphrase: String, // 6 digits
    pub current_passphrase: Option<String>,
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
            trash_cleanup_days: settings.trash_cleanup_days,
            has_lock_passphrase: settings.lock_passphrase.is_some(),
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
            trash_cleanup_days: Set(30),
            lock_passphrase: Set(None),
            created_at: Set(Utc::now()),
            updated_at: Set(Utc::now()),
        };

        let res = new_settings.insert(&state.db).await?;

        Ok(Json(UserSettingsResponse {
            theme: res.theme,
            view_style: res.view_style,
            trash_cleanup_days: res.trash_cleanup_days,
            has_lock_passphrase: false,
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
        if let Some(days) = req.trash_cleanup_days {
            active_model.trash_cleanup_days = Set(days);
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
            trash_cleanup_days: Set(req.trash_cleanup_days.unwrap_or(30)),
            created_at: Set(Utc::now()),
            updated_at: Set(Utc::now()),
            ..Default::default()
        };
        active_model.insert(&state.db).await?
    };

    Ok(Json(UserSettingsResponse {
        theme: res.theme,
        view_style: res.view_style,
        trash_cleanup_days: res.trash_cleanup_days,
        has_lock_passphrase: res.lock_passphrase.is_some(),
    }))
}

#[utoipa::path(
    post,
    path = "/settings/lock-passphrase",
    request_body = SetLockPassphraseRequest,
    responses(
        (status = 200, description = "Lock passphrase set successful", body = UserSettingsResponse),
        (status = 400, description = "Invalid passphrase (must be 6 digits)"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Current passphrase incorrect")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn set_lock_passphrase(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<SetLockPassphraseRequest>,
) -> Result<Json<UserSettingsResponse>, AppError> {
    let settings = UserSettings::find_by_id(claims.sub.clone())
        .one(&state.db)
        .await?;

    let settings = if let Some(s) = settings {
        s
    } else {
        // Create default settings if not found
        let new_settings = user_settings::ActiveModel {
            user_id: Set(claims.sub.clone()),
            theme: Set("dark".to_string()),
            view_style: Set("list".to_string()),
            trash_cleanup_days: Set(30),
            lock_passphrase: Set(None),
            created_at: Set(Utc::now()),
            updated_at: Set(Utc::now()),
        };
        new_settings.insert(&state.db).await?
    };

    // 1. If current passphrase exists, verify it
    if let Some(ref existing_hash) = settings.lock_passphrase {
        let current_p = req.current_passphrase.ok_or_else(|| {
            AppError::Forbidden("Current passphrase required to change lock".to_string())
        })?;
        let current_hash = crate::utils::hash::calculate_hash(current_p.as_bytes());
        if *existing_hash != current_hash {
            return Err(AppError::Forbidden("Current passphrase incorrect".to_string()));
        }
    }

    // 2. Allow clearing it if the request is empty
    let new_hash = if req.passphrase.is_empty() {
        None
    } else {
        // Validate 6 digits
        if req.passphrase.len() != 6 || !req.passphrase.chars().all(|c| c.is_ascii_digit()) {
            return Err(AppError::BadRequest(
                "Passphrase must be exactly 6 digits".to_string(),
            ));
        }
        Some(crate::utils::hash::calculate_hash(req.passphrase.as_bytes()))
    };

    // 3. Set new hash
    let mut active = settings.into_active_model();
    active.lock_passphrase = Set(new_hash);
    active.updated_at = Set(Utc::now());
    let res = active.update(&state.db).await?;

    Ok(Json(UserSettingsResponse {
        theme: res.theme,
        view_style: res.view_style,
        trash_cleanup_days: res.trash_cleanup_days,
        has_lock_passphrase: res.lock_passphrase.is_some(),
    }))
}
