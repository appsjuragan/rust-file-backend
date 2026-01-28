pub mod config;
pub mod entities;
pub mod handlers;
pub mod middleware;
pub mod models;
pub mod services;
pub mod utils;

use crate::config::SecurityConfig;
use crate::services::scanner::VirusScanner;
use crate::services::storage::StorageService;
use axum::{
    Router,
    middleware::from_fn,
    routing::{get, post},
};
use sea_orm::DatabaseConnection;
use std::sync::Arc;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[derive(OpenApi)]
#[openapi(
    paths(
        handlers::auth::register,
        handlers::auth::login,
        handlers::files::upload_file,
        handlers::files::pre_check_dedup,

        handlers::files::download_file,
        handlers::files::list_files,
        handlers::files::create_folder,
        handlers::files::delete_item,
        handlers::files::rename_item,
    ),
    components(
        schemas(
            handlers::auth::AuthRequest,
            handlers::auth::AuthResponse,
            handlers::files::UploadResponse,
            handlers::files::PreCheckRequest,

            handlers::files::PreCheckResponse,
            handlers::files::FileMetadataResponse,
            handlers::files::CreateFolderRequest,
            handlers::files::RenameRequest,
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
    pub db: DatabaseConnection,
    pub storage: Arc<StorageService>,
    pub scanner: Arc<dyn VirusScanner>,
    pub config: SecurityConfig,
}

pub fn create_app(state: AppState) -> Router {
    Router::new()
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .route("/register", post(handlers::auth::register))
        .route("/login", post(handlers::auth::login))
        .route(
            "/pre-check",
            post(handlers::files::pre_check_dedup)
                .layer(from_fn(middleware::auth::auth_middleware)),
        )
        .route(
            "/upload",
            post(handlers::files::upload_file).layer(from_fn(middleware::auth::auth_middleware)),
        )
        .route(
            "/files/:id",
            get(handlers::files::download_file)
                .delete(handlers::files::delete_item)
                .layer(from_fn(middleware::auth::auth_middleware)),
        )
        .route(
            "/files/:id/rename",
            axum::routing::put(handlers::files::rename_item)
                .layer(from_fn(middleware::auth::auth_middleware)),
        )
        .route(
            "/files",
            get(handlers::files::list_files).layer(from_fn(middleware::auth::auth_middleware)),
        )
        .route(
            "/folders",
            post(handlers::files::create_folder).layer(from_fn(middleware::auth::auth_middleware)),
        )
        .with_state(state)
}
