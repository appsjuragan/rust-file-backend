pub mod api;
pub mod config;
pub mod entities;
pub mod infrastructure;
pub mod models;
pub mod services;
pub mod utils;

use crate::config::SecurityConfig;
use crate::services::file_service::FileService;
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
        api::handlers::auth::register,
        api::handlers::auth::login,
        api::handlers::files::upload_file,
        api::handlers::files::pre_check_dedup,

        api::handlers::files::download_file,
        api::handlers::files::list_files,
        api::handlers::files::create_folder,
        api::handlers::files::delete_item,
        api::handlers::files::rename_item,
        api::handlers::files::bulk_delete,
        api::handlers::health::health_check,
    ),
    components(
        schemas(
            api::handlers::auth::AuthRequest,
            api::handlers::auth::AuthResponse,
            api::handlers::files::UploadResponse,
            api::handlers::files::PreCheckRequest,

            api::handlers::files::PreCheckResponse,
            api::handlers::files::FileMetadataResponse,
            api::handlers::files::CreateFolderRequest,
            api::handlers::files::RenameRequest,
            api::handlers::files::BulkDeleteRequest,
            api::handlers::files::BulkDeleteResponse,
            api::handlers::health::HealthResponse,
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
    pub storage: Arc<dyn StorageService>,
    pub scanner: Arc<dyn VirusScanner>,
    pub file_service: Arc<FileService>,
    pub config: SecurityConfig,
}

pub fn create_app(state: AppState) -> Router {
    Router::new()
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .route("/health", get(api::handlers::health::health_check))
        .layer(from_fn(api::middleware::metrics::metrics_middleware))
        .layer(from_fn(api::middleware::request_id::request_id_middleware))
        .route("/register", post(api::handlers::auth::register))
        .route("/login", post(api::handlers::auth::login))
        .route(
            "/pre-check",
            post(api::handlers::files::pre_check_dedup)
                .layer(from_fn(api::middleware::auth::auth_middleware)),
        )
        .route(
            "/upload",
            post(api::handlers::files::upload_file)
                .layer(from_fn(api::middleware::auth::auth_middleware)),
        )
        .route(
            "/files/:id",
            get(api::handlers::files::download_file)
                .delete(api::handlers::files::delete_item)
                .layer(from_fn(api::middleware::auth::auth_middleware)),
        )
        .route(
            "/files/:id/rename",
            axum::routing::put(api::handlers::files::rename_item)
                .layer(from_fn(api::middleware::auth::auth_middleware)),
        )
        .route(
            "/files",
            get(api::handlers::files::list_files)
                .layer(from_fn(api::middleware::auth::auth_middleware)),
        )
        .route(
            "/folders",
            post(api::handlers::files::create_folder)
                .layer(from_fn(api::middleware::auth::auth_middleware)),
        )
        .route(
            "/files/bulk-delete",
            post(api::handlers::files::bulk_delete)
                .layer(from_fn(api::middleware::auth::auth_middleware)),
        )
        .with_state(state)
}
