use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::utils::auth::create_jwt;
use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use axum::{Json, extract::State, http::StatusCode};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use std::env;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Deserialize, ToSchema)]
pub struct AuthRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct AuthResponse {
    pub token: String,
}

#[utoipa::path(
    post,
    path = "/register",
    request_body = AuthRequest,
    responses(
        (status = 201, description = "User registered successfully"),
        (status = 400, description = "Username already exists")
    )
)]
pub async fn register(
    State(state): State<crate::AppState>,
    Json(payload): Json<AuthRequest>,
) -> Result<StatusCode, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(payload.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(e.to_string()))?
        .to_string();

    let id = Uuid::new_v4().to_string();

    let user = users::ActiveModel {
        id: Set(id),
        username: Set(payload.username),
        password_hash: Set(password_hash),
        ..Default::default()
    };

    user.insert(&state.db)
        .await
        .map_err(|_e| AppError::BadRequest("Username already exists".to_string()))?;

    Ok(StatusCode::CREATED)
}

#[utoipa::path(
    post,
    path = "/login",
    request_body = AuthRequest,
    responses(
        (status = 200, description = "Login successful", body = AuthResponse),
        (status = 401, description = "Invalid credentials")
    )
)]
pub async fn login(
    State(state): State<crate::AppState>,
    Json(payload): Json<AuthRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let user = Users::find()
        .filter(users::Column::Username.eq(payload.username))
        .one(&state.db)
        .await?
        .ok_or(AppError::Unauthorized("Invalid credentials".to_string()))?;

    let argon2 = Argon2::default();
    let parsed_hash = argon2::PasswordHash::new(&user.password_hash)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    argon2
        .verify_password(payload.password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::Unauthorized("Invalid credentials".to_string()))?;

    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "secret".to_string());
    let token_str = create_jwt(&user.id, &secret).map_err(|e| AppError::Internal(e.to_string()))?;

    // Store token in DB for expiration/revocation tracking
    let token_id = Uuid::new_v4().to_string();
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(24);

    let token_model = tokens::ActiveModel {
        id: Set(token_id),
        user_id: Set(user.id),
        token: Set(token_str.clone()),
        expires_at: Set(expires_at),

    };

    token_model.insert(&state.db).await?;

    Ok(Json(AuthResponse { token: token_str }))
}
