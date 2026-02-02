use crate::utils::auth::validate_jwt;
use crate::{AppState, entities::prelude::Users};
use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use sea_orm::EntityTrait;
use serde::Deserialize;

#[derive(Deserialize)]
struct AuthQuery {
    token: Option<String>,
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
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
        let secret = &state.config.jwt_secret;

        if let Ok(claims) = validate_jwt(&token, secret) {
            // Check if user still exists in DB
            let user_exists = Users::find_by_id(claims.sub.clone())
                .one(&state.db)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
                .is_some();

            if user_exists {
                req.extensions_mut().insert(claims);
                return Ok(next.run(req).await);
            }
        }
    }

    Err(StatusCode::UNAUTHORIZED)
}
