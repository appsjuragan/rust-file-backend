use crate::utils::auth::validate_jwt;
use axum::{extract::Request, http::StatusCode, middleware::Next, response::Response};
use std::env;
use serde::Deserialize;

#[derive(Deserialize)]
struct AuthQuery {
    token: Option<String>,
}

pub async fn auth_middleware(mut req: Request, next: Next) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(|s| s.to_string());

    let token = if let Some(t) = auth_header {
        Some(t)
    } else {
        // Try query parameter
        let query = req.uri().query().unwrap_or_default();
        serde_urlencoded::from_str::<AuthQuery>(query)
            .ok()
            .and_then(|q| q.token)
    };

    if let Some(token) = token {
        let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "secret".to_string());

        if let Ok(claims) = validate_jwt(&token, &secret) {
            req.extensions_mut().insert(claims);
            return Ok(next.run(req).await);
        }
    }

    Err(StatusCode::UNAUTHORIZED)
}
