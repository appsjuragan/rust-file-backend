use crate::utils::auth::validate_jwt;
use axum::{extract::Request, http::StatusCode, middleware::Next, response::Response};
use std::env;

pub async fn auth_middleware(mut req: Request, next: Next) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok());

    if let Some(auth_header) = auth_header {
        if let Some(token) = auth_header.strip_prefix("Bearer ") {
            let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "secret".to_string());

            if let Ok(claims) = validate_jwt(token, &secret) {
                req.extensions_mut().insert(claims);
                return Ok(next.run(req).await);
            }
        }
    }

    Err(StatusCode::UNAUTHORIZED)
}
