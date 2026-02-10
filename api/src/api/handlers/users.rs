use crate::api::error::AppError;
use crate::entities::{prelude::*, user_file_facts, users};
use crate::utils::auth::Claims;
use argon2::{
    Argon2,
    password_hash::{PasswordHasher, SaltString, rand_core::OsRng},
};
use axum::{
    Extension, Json,
    extract::{Multipart, Query, State, Path},
    response::IntoResponse,
};
use sea_orm::{ActiveModelTrait, EntityTrait, Set};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use validator::Validate;

use chrono::Utc;

#[derive(Serialize, ToSchema, Deserialize)]
pub struct UserProfileResponse {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Deserialize, ToSchema, Validate)]
pub struct UpdateProfileRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: Option<String>,
    #[validate(length(min = 1, max = 100))]
    pub name: Option<String>,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct AvatarResponse {
    pub url: String,
}

#[utoipa::path(
    get,
    path = "/users/me",
    responses(
        (status = 200, description = "Profile retrieved successfully", body = UserProfileResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn get_profile(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<UserProfileResponse>, AppError> {
    let user = Users::find_by_id(&claims.sub)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let avatar_url = user.avatar_url.map(|url| {
        if url.starts_with("/users/me/avatar") {
            format!("/users/avatar/{}", user.id)
        } else {
            url
        }
    });

    Ok(Json(UserProfileResponse {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        avatar_url,
    }))
}

#[utoipa::path(
    put,
    path = "/users/me",
    request_body = UpdateProfileRequest,
    responses(
        (status = 200, description = "Profile updated successfully", body = UserProfileResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn update_profile(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<UserProfileResponse>, AppError> {
    payload
        .validate()
        .map_err(|e| {
            tracing::error!("Validation failed for update_profile: {}", e);
            AppError::BadRequest(e.to_string())
        })?;

    let user = Users::find_by_id(&claims.sub)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let mut active: users::ActiveModel = user.into();

    if let Some(email) = payload.email {
        active.email = Set(Some(email));
    }
    if let Some(name) = payload.name {
        active.name = Set(Some(name));
    }
    if let Some(password) = payload.password
        && !password.is_empty()
    {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| AppError::Internal(e.to_string()))?
            .to_string();
        active.password_hash = Set(Some(password_hash));
    }

    let updated = active
        .update(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let avatar_url = updated.avatar_url.map(|url| {
        if url.starts_with("/users/me/avatar") {
            format!("/users/avatar/{}", updated.id)
        } else {
            url
        }
    });

    Ok(Json(UserProfileResponse {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        name: updated.name,
        avatar_url,
    }))
}

#[utoipa::path(
    post,
    path = "/users/me/avatar",
    request_body(content = Object, description = "Avatar image file", content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "Avatar uploaded successfully", body = AvatarResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn upload_avatar(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> Result<Json<AvatarResponse>, AppError> {
    let field = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
        .ok_or_else(|| AppError::BadRequest("No file found in request".to_string()))?;

    let _field_name = field.name().unwrap_or("file").to_string();
    let data = field
        .bytes()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .to_vec();

    // Store in MinIO under avatars/ folder - always use .jpg since frontend sends JPEG
    let storage_key = format!("avatars/{}.jpg", claims.sub);

    state
        .storage
        .upload_file(&storage_key, data)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to upload avatar: {}", e)))?;

    // Update user avatar_url
    let user = Users::find_by_id(&claims.sub)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let mut active: users::ActiveModel = user.into();
    let avatar_url = format!("/users/avatar/{}?t={}", claims.sub, uuid::Uuid::new_v4()); // Cache busting URL
    active.avatar_url = Set(Some(avatar_url.clone()));
    active
        .update(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(AvatarResponse { url: avatar_url }))
}

#[utoipa::path(
    get,
    path = "/users/avatar/{user_id}",
    responses(
        (status = 200, description = "Avatar image"),
        (status = 404, description = "Avatar not found")
    )
)]
pub async fn get_avatar(
    Path(user_id): Path<String>,
    State(state): State<crate::AppState>,
    Query(_params): Query<std::collections::HashMap<String, String>>, // For cache busting
) -> Result<impl IntoResponse, AppError> {
    // Try common extensions, prioritizing jpg since that's what we upload
    for ext in &["jpg", "png", "jpeg", "gif", "webp"] {
        let key = format!("avatars/{}.{}", user_id, ext);
        if let Ok(data) = state.storage.get_file(&key).await {
            let mime = match *ext {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => "application/octet-stream",
            };
            return Ok(([(axum::http::header::CONTENT_TYPE, mime)], data).into_response());
        }
    }

    Err(AppError::NotFound("Avatar not found".to_string()))
}

#[utoipa::path(
    get,
    path = "/users/me/facts",
    responses(
        (status = 200, description = "Facts retrieved successfully", body = user_file_facts::Model),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn get_user_facts(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<user_file_facts::Model>, AppError> {
    let facts = UserFileFacts::find_by_id(&claims.sub)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let should_update = match &facts {
        None => true,
        Some(f) => {
            let age = Utc::now() - f.updated_at;
            age > chrono::Duration::seconds(10)
        }
    };

    if should_update {
        crate::services::facts_service::FactsService::update_user_facts(&state.db, &claims.sub)
            .await?;
        let updated_facts = UserFileFacts::find_by_id(&claims.sub)
            .one(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::Internal("Failed to generate facts".to_string()))?;
        Ok(Json(updated_facts))
    } else {
        Ok(Json(facts.unwrap()))
    }
}
