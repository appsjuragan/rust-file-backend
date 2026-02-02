use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::services::audit::{AuditEventType, AuditService};
use crate::utils::auth::create_jwt;
use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use axum::{Json, extract::State, http::StatusCode};
use axum::{
    extract::Query,
    response::{IntoResponse, Redirect},
};
use openidconnect::{
    AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, HttpRequest, HttpResponse,
    IssuerUrl, Nonce, RedirectUrl, Scope, TokenResponse, TokenUrl,
    core::{CoreAuthenticationFlow, CoreClient, CoreJsonWebKeySet, CoreProviderMetadata},
};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use std::env;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

#[derive(Deserialize, ToSchema, Validate)]
pub struct AuthRequest {
    #[validate(length(
        min = 3,
        max = 50,
        message = "Username must be between 3 and 50 characters"
    ))]
    pub username: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
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
    payload
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(payload.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(e.to_string()))?
        .to_string();

    let id = Uuid::new_v4().to_string();

    let user = users::ActiveModel {
        id: Set(id.clone()),
        username: Set(payload.username),
        password_hash: Set(Some(password_hash)),
        public_key: Set(None),
        private_key_path: Set(None),
        private_key_enc: Set(None),
        ..Default::default()
    };

    user.insert(&state.db)
        .await
        .map_err(|_e| AppError::BadRequest("Username already exists".to_string()))?;

    let audit = AuditService::new(state.db.clone());
    audit
        .log(
            AuditEventType::UserRegister,
            Some(id),
            None,
            "register",
            "success",
            None,
            None,
        )
        .await;

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

    let password_hash = user
        .password_hash
        .as_ref()
        .ok_or(AppError::Unauthorized("Invalid credentials".to_string()))?;

    let argon2 = Argon2::default();
    let parsed_hash =
        argon2::PasswordHash::new(password_hash).map_err(|e| AppError::Internal(e.to_string()))?;

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

#[derive(Deserialize)]
pub struct AuthCallbackParams {
    pub code: String,
    pub state: String,
}

#[derive(Debug)]
pub struct HttpClientError(Box<dyn std::error::Error + Send + Sync>);

impl std::fmt::Display for HttpClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "HttpClientError: {}", self.0)
    }
}

impl std::error::Error for HttpClientError {}

pub async fn async_http_client(request: HttpRequest) -> Result<HttpResponse, HttpClientError> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| HttpClientError(Box::new(e)))?;

    let (parts, body) = request.into_parts();
    let url = parts.uri.to_string();

    let mut request_builder = client.request(parts.method, url).body(body);

    for (name, value) in parts.headers {
        if let Some(n) = name {
            request_builder = request_builder.header(n, value);
        }
    }

    let response = request_builder
        .send()
        .await
        .map_err(|e| HttpClientError(Box::new(e)))?;

    let mut builder = axum::http::Response::builder().status(response.status());

    for (name, value) in response.headers() {
        builder = builder.header(name, value);
    }

    let body = response
        .bytes()
        .await
        .map_err(|e| HttpClientError(Box::new(e)))?
        .to_vec();

    builder.body(body).map_err(|e| HttpClientError(Box::new(e)))
}

pub async fn login_oidc(
    State(state): State<crate::AppState>,
) -> Result<impl IntoResponse, AppError> {
    let issuer_url = state
        .config
        .oidc_issuer_url
        .as_ref()
        .ok_or_else(|| AppError::Internal("OIDC_ISSUER_URL not set".to_string()))?;
    let client_id = state
        .config
        .oidc_client_id
        .as_ref()
        .ok_or_else(|| AppError::Internal("OIDC_CLIENT_ID not set".to_string()))?;
    let client_secret = state
        .config
        .oidc_client_secret
        .as_ref()
        .ok_or_else(|| AppError::Internal("OIDC_CLIENT_SECRET not set".to_string()))?;
    let redirect_url = state
        .config
        .oidc_redirect_url
        .as_ref()
        .ok_or_else(|| AppError::Internal("OIDC_REDIRECT_URL not set".to_string()))?;

    if state.config.oidc_skip_discovery {
        let issuer =
            IssuerUrl::new(issuer_url.clone()).map_err(|e| AppError::Internal(e.to_string()))?;
        let auth_url = AuthUrl::new(format!("{}/connect/authorize", issuer_url))
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let token_url = TokenUrl::new(format!("{}/connect/token", issuer_url))
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Fetch JWKS (or use empty fallback for tests)
        let jwks_url = format!("{}/.well-known/openid-configuration/jwks", issuer_url);
        let jwks: CoreJsonWebKeySet = match reqwest::get(&jwks_url).await {
            Ok(resp) => resp.json().await.unwrap_or_else(|_| serde_json::from_str("{\"keys\":[]}").unwrap()),
            Err(_) => serde_json::from_str("{\"keys\":[]}").unwrap(),
        };

        let client = CoreClient::new(ClientId::new(client_id.clone()), issuer, jwks)
            .set_client_secret(ClientSecret::new(client_secret.clone()))
            .set_auth_uri(auth_url)
            .set_token_uri(token_url)
            .set_redirect_uri(
                RedirectUrl::new(redirect_url.clone())
                    .map_err(|e| AppError::Internal(e.to_string()))?,
            );

        let (auth_url, _csrf_token, _nonce) = client
            .authorize_url(
                CoreAuthenticationFlow::AuthorizationCode,
                CsrfToken::new_random,
                Nonce::new_random,
            )
            .add_scope(Scope::new("email".to_string()))
            .add_scope(Scope::new("profile".to_string()))
            .url();

        Ok(Redirect::to(auth_url.as_str()))
    } else {
        let provider_metadata = CoreProviderMetadata::discover_async(
            IssuerUrl::new(issuer_url.clone()).map_err(|e| AppError::Internal(e.to_string()))?,
            &async_http_client,
        )
        .await
        .map_err(|e| AppError::Internal(format!("Failed to discover OIDC provider: {}", e)))?;

        let client = CoreClient::from_provider_metadata(
            provider_metadata,
            ClientId::new(client_id.clone()),
            Some(ClientSecret::new(client_secret.clone())),
        )
        .set_redirect_uri(
            RedirectUrl::new(redirect_url.clone())
                .map_err(|e| AppError::Internal(e.to_string()))?,
        );

        let (auth_url, _csrf_token, _nonce) = client
            .authorize_url(
                CoreAuthenticationFlow::AuthorizationCode,
                CsrfToken::new_random,
                Nonce::new_random,
            )
            .add_scope(Scope::new("email".to_string()))
            .add_scope(Scope::new("profile".to_string()))
            .url();

        Ok(Redirect::to(auth_url.as_str()))
    }
}

pub async fn callback_oidc(
    State(state): State<crate::AppState>,
    Query(params): Query<AuthCallbackParams>,
) -> Result<impl IntoResponse, AppError> {
    let issuer_url = state
        .config
        .oidc_issuer_url
        .as_ref()
        .ok_or_else(|| AppError::Internal("OIDC_ISSUER_URL not set".to_string()))?;
    let client_id = state
        .config
        .oidc_client_id
        .as_ref()
        .ok_or_else(|| AppError::Internal("OIDC_CLIENT_ID not set".to_string()))?;
    let client_secret = state
        .config
        .oidc_client_secret
        .as_ref()
        .ok_or_else(|| AppError::Internal("OIDC_CLIENT_SECRET not set".to_string()))?;
    let redirect_url = state
        .config
        .oidc_redirect_url
        .as_ref()
        .ok_or_else(|| AppError::Internal("OIDC_REDIRECT_URL not set".to_string()))?;

    let token_response = if state.config.oidc_skip_discovery {
        let issuer =
            IssuerUrl::new(issuer_url.clone()).map_err(|e| AppError::Internal(e.to_string()))?;
        let auth_url = AuthUrl::new(format!("{}/connect/authorize", issuer_url))
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let token_url = TokenUrl::new(format!("{}/connect/token", issuer_url))
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Fetch JWKS
        let jwks_url = format!("{}/.well-known/openid-configuration/jwks", issuer_url);
        let jwks: CoreJsonWebKeySet = reqwest::get(&jwks_url)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to fetch JWKS: {}", e)))?
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse JWKS: {}", e)))?;

        let client = CoreClient::new(ClientId::new(client_id.clone()), issuer, jwks)
            .set_client_secret(ClientSecret::new(client_secret.clone()))
            .set_auth_uri(auth_url)
            .set_token_uri(token_url)
            .set_redirect_uri(
                RedirectUrl::new(redirect_url.clone())
                    .map_err(|e| AppError::Internal(e.to_string()))?,
            );

        let token_response = client
            .exchange_code(AuthorizationCode::new(params.code))
            .request_async(&async_http_client)
            .await
            .map_err(|e| AppError::Internal(format!("Token exchange failed: {}", e)))?;

        // Validate ID Token
        let id_token = token_response
            .id_token()
            .ok_or_else(|| AppError::Internal("No ID token received".to_string()))?;

        let claims = id_token
            .claims(&client.id_token_verifier(), &Nonce::new_random())
            .map_err(|e| AppError::Internal(format!("Invalid ID token: {}", e)))?;

        (claims.clone(), token_response)
    } else {
        let provider_metadata = CoreProviderMetadata::discover_async(
            IssuerUrl::new(issuer_url.clone()).map_err(|e| AppError::Internal(e.to_string()))?,
            &async_http_client,
        )
        .await
        .map_err(|e| AppError::Internal(format!("Failed to discover OIDC provider: {}", e)))?;

        let client = CoreClient::from_provider_metadata(
            provider_metadata,
            ClientId::new(client_id.clone()),
            Some(ClientSecret::new(client_secret.clone())),
        )
        .set_redirect_uri(
            RedirectUrl::new(redirect_url.clone())
                .map_err(|e| AppError::Internal(e.to_string()))?,
        );

        let token_response = client
            .exchange_code(AuthorizationCode::new(params.code))
            .map_err(|e| AppError::Internal(e.to_string()))?
            .request_async(&async_http_client)
            .await
            .map_err(|e| AppError::Internal(format!("Token exchange failed: {}", e)))?;

        // Validate ID Token
        let id_token = token_response
            .id_token()
            .ok_or_else(|| AppError::Internal("No ID token received".to_string()))?;

        let claims = id_token
            .claims(&client.id_token_verifier(), &Nonce::new_random())
            .map_err(|e| AppError::Internal(format!("Invalid ID token: {}", e)))?;

        (claims.clone(), token_response)
    };

    let (claims, _token_response) = token_response;

    let oidc_sub = claims.subject().as_str().to_string();
    let email = claims.email().map(|e| e.as_str().to_string());
    let username = claims
        .preferred_username()
        .map(|n| n.as_str().to_string())
        .or(email.clone())
        .unwrap_or_else(|| format!("user_{}", Uuid::new_v4()));

    // Find or Create User
    let user = Users::find()
        .filter(users::Column::OidcSub.eq(oidc_sub.clone()))
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let user = match user {
        Some(u) => u,
        None => {
            // Create new user
            let id = Uuid::new_v4().to_string();

            // Create new user
            let user = users::ActiveModel {
                id: Set(id.clone()),
                username: Set(username),
                oidc_sub: Set(Some(oidc_sub)),
                email: Set(email),
                password_hash: Set(None),
                public_key: Set(None),
                private_key_path: Set(None),
                private_key_enc: Set(None),
                ..Default::default()
            };
            let u = user
                .insert(&state.db)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to create user: {}", e)))?;

            let audit = AuditService::new(state.db.clone());
            audit
                .log(
                    AuditEventType::UserRegister,
                    Some(id),
                    None,
                    "oidc_register",
                    "success",
                    None,
                    None,
                )
                .await;

            u
        }
    };

    // Ensure existing users have keys (Migration/Backfill)
    // No Key Backfill needed

    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "secret".to_string());
    let token_str = create_jwt(&user.id, &secret).map_err(|e| AppError::Internal(e.to_string()))?;

    // Store token in DB
    let token_id = Uuid::new_v4().to_string();
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(24);

    let token_model = tokens::ActiveModel {
        id: Set(token_id),
        user_id: Set(user.id),
        token: Set(token_str.clone()),
        expires_at: Set(expires_at),
    };

    token_model.insert(&state.db).await?;

    // Redirect to frontend with token
    let frontend_url =
        std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:5173".to_string());
    Ok(Redirect::to(&format!(
        "{}/?token={}",
        frontend_url, token_str
    )))
}
