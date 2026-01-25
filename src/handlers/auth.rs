use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Serialize, Deserialize};
use crate::utils::auth::create_jwt;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use uuid::Uuid;
use std::env;
use utoipa::ToSchema;

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
) -> Result<StatusCode, (StatusCode, String)> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(payload.password.as_bytes(), &salt)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .to_string();

    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)"
    )
    .bind(id)
    .bind(payload.username)
    .bind(password_hash)
    .execute(&state.db)
    .await
    .map_err(|_e| (StatusCode::BAD_REQUEST, "Username already exists".to_string()))?;

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
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let user = sqlx::query_as::<_, crate::models::User>(
        "SELECT id, username, password_hash, created_at FROM users WHERE username = ?"
    )
    .bind(payload.username)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()))?;

    let argon2 = Argon2::default();
    let parsed_hash = argon2::PasswordHash::new(&user.password_hash)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    argon2
        .verify_password(payload.password.as_bytes(), &parsed_hash)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()))?;

    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "secret".to_string());
    let token = create_jwt(&user.id, &secret)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Store token in DB for expiration/revocation tracking
    let token_id = Uuid::new_v4().to_string();
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(24);
    
    sqlx::query(
        "INSERT INTO tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)"
    )
    .bind(token_id)
    .bind(user.id)
    .bind(&token)
    .bind(expires_at)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AuthResponse { token }))
}
