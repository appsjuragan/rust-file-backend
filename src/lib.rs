pub mod models;
pub mod handlers;
pub mod middleware;
pub mod services;
pub mod utils;

use axum::{
    routing::post,
    Router,
    middleware::from_fn,
};
use sqlx::SqlitePool;
use std::sync::Arc;
use crate::services::storage::StorageService;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[derive(OpenApi)]
#[openapi(
    paths(
        handlers::auth::register,
        handlers::auth::login,
        handlers::files::upload_file,
    ),
    components(
        schemas(
            handlers::auth::AuthRequest,
            handlers::auth::AuthResponse,
            handlers::files::UploadResponse,
            models::User,
            models::Token,
            models::StorageFile,
            models::UserFile,
        )
    ),
    tags(
        (name = "auth", description = "Authentication endpoints"),
        (name = "files", description = "File management endpoints")
    )
)]
pub struct ApiDoc;

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub storage: Arc<StorageService>,
}

pub fn create_app(state: AppState) -> Router {
    Router::new()
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .route("/register", post(handlers::auth::register))
        .route("/login", post(handlers::auth::login))
        .route(
            "/upload",
            post(handlers::files::upload_file)
                .layer(from_fn(middleware::auth::auth_middleware)),
        )
        .with_state(state)
}
