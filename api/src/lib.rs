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
    middleware::{from_fn, from_fn_with_state},
    routing::{get, post},
};
use sea_orm::DatabaseConnection;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[derive(OpenApi)]
#[openapi(
    paths(
        api::handlers::auth::register,
        api::handlers::auth::login,
        api::handlers::files::upload_file,
        api::handlers::files::pre_check_dedup,
        api::handlers::files::link_file,
        api::handlers::files::download_file,
        api::handlers::files::list_files,
        api::handlers::files::create_folder,
        api::handlers::files::delete_item,
        api::handlers::files::rename_item,
        api::handlers::files::get_folder_path,
        api::handlers::files::get_zip_contents,
        api::handlers::files::bulk_delete,
        api::handlers::files::bulk_move,
        api::handlers::files::generate_download_ticket,
        api::handlers::files::download_file_with_ticket,
        api::handlers::user_settings::get_settings,
        api::handlers::user_settings::update_settings,
        api::handlers::health::get_validation_rules,
        api::handlers::health::health_check,
        api::handlers::users::get_profile,
        api::handlers::users::update_profile,
        api::handlers::users::upload_avatar,
        api::handlers::users::get_avatar,
        api::handlers::users::get_user_facts,
        api::handlers::upload::init_upload_handler,
        api::handlers::upload::upload_chunk_handler,
        api::handlers::upload::complete_upload_handler,
        api::handlers::upload::abort_upload_handler,
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
            api::handlers::files::LinkFileRequest,
            api::handlers::files::ZipEntry,
            api::handlers::files::BulkDeleteResponse,
            api::handlers::files::BulkMoveRequest,
            api::handlers::files::BulkMoveResponse,
            api::handlers::user_settings::UserSettingsResponse,
            api::handlers::user_settings::UpdateUserSettingsRequest,
            api::handlers::health::HealthResponse,
            crate::utils::validation::ValidationRules,
            api::handlers::users::UserProfileResponse,
            api::handlers::users::UpdateProfileRequest,
            api::handlers::users::AvatarResponse,
            crate::services::upload_service::InitUploadRequest,
            crate::services::upload_service::InitUploadResponse,
            crate::services::upload_service::UploadPartResponse,
            crate::services::upload_service::CompleteUploadRequest,
            crate::services::upload_service::FileResponse,
        )
    ),
    tags(
        (name = "auth", description = "Authentication endpoints"),
        (name = "files", description = "File management endpoints"),
        (name = "users", description = "User profile endpoints"),
        (name = "settings", description = "User preferences endpoints"),
        (name = "system", description = "System health and status")
    )
)]
pub struct ApiDoc;

#[derive(Clone)]
pub struct AppState {
    pub db: DatabaseConnection,
    pub storage: Arc<dyn StorageService>,
    pub scanner: Arc<dyn VirusScanner>,
    pub file_service: Arc<FileService>,
    pub upload_service: Arc<crate::services::upload_service::UploadService>,
    pub config: SecurityConfig,
    pub download_tickets: Arc<dashmap::DashMap<String, (String, chrono::DateTime<chrono::Utc>)>>,
}

pub fn create_app(state: AppState) -> Router {
    let auth_middleware = from_fn_with_state(state.clone(), api::middleware::auth::auth_middleware);

    // Public routes
    let public_routes = Router::new()
        .route("/health", get(api::handlers::health::health_check))
        .route(
            "/system/validation-rules",
            get(api::handlers::health::get_validation_rules),
        )
        .route("/register", post(api::handlers::auth::register))
        .route("/login", post(api::handlers::auth::login))
        .route("/auth/oidc/login", get(api::handlers::auth::login_oidc))
        .route("/auth/oidc/callback", get(api::handlers::auth::callback_oidc))
        .route(
            "/download/:ticket",
            get(api::handlers::files::download_file_with_ticket),
        );

    // Protected routes
    let protected_routes = Router::new()
        .route("/pre-check", post(api::handlers::files::pre_check_dedup))
        .route("/files/link", post(api::handlers::files::link_file))
        .route(
            "/upload",
            post(api::handlers::files::upload_file).layer(axum::extract::DefaultBodyLimit::max(
                state.config.max_file_size + 10 * 1024 * 1024,
            )),
        )
        .route(
            "/files/upload/init",
            post(api::handlers::upload::init_upload_handler),
        )
        .route(
            "/files/upload/:upload_id/chunk/:part_number",
            axum::routing::put(api::handlers::upload::upload_chunk_handler),
        )
        .route(
            "/files/upload/:upload_id/complete",
            post(api::handlers::upload::complete_upload_handler),
        )
        .route(
            "/files/upload/:upload_id",
            axum::routing::delete(api::handlers::upload::abort_upload_handler),
        )
        .route(
            "/files/:id",
            get(api::handlers::files::download_file).delete(api::handlers::files::delete_item),
        )
        .route(
            "/files/:id/ticket",
            post(api::handlers::files::generate_download_ticket),
        )
        .route(
            "/files/:id/rename",
            axum::routing::put(api::handlers::files::rename_item),
        )
        .route("/files/:id/path", get(api::handlers::files::get_folder_path))
        .route(
            "/files/:id/zip-contents",
            get(api::handlers::files::get_zip_contents),
        )
        .route("/files", get(api::handlers::files::list_files))
        .route("/folders", post(api::handlers::files::create_folder))
        .route("/files/bulk-delete", post(api::handlers::files::bulk_delete))
        .route("/files/bulk-move", post(api::handlers::files::bulk_move))
        .route(
            "/settings",
            get(api::handlers::user_settings::get_settings)
                .put(api::handlers::user_settings::update_settings),
        )
        .route(
            "/users/me",
            get(api::handlers::users::get_profile).put(api::handlers::users::update_profile),
        )
        .route(
            "/users/me/avatar",
            get(api::handlers::users::get_avatar).post(api::handlers::users::upload_avatar),
        )
        .route("/users/me/facts", get(api::handlers::users::get_user_facts))
        .layer(auth_middleware);

    // Configure CORS based on allowed_origins
    let cors_layer = if state.config.allowed_origins.contains(&"*".to_string()) {
        CorsLayer::new().allow_origin(Any)
    } else {
        let origins: Vec<axum::http::HeaderValue> = state
            .config
            .allowed_origins
            .iter()
            .filter_map(|s| s.parse().ok())
            .collect();
        CorsLayer::new().allow_origin(origins)
    };

    Router::new()
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .merge(public_routes)
        .merge(protected_routes)
        .layer(from_fn(api::middleware::metrics::metrics_middleware))
        .layer(from_fn(api::middleware::request_id::request_id_middleware))
        .layer(from_fn(api::middleware::security::security_headers))
        .layer(axum::extract::DefaultBodyLimit::max(
            state.config.max_file_size + 10 * 1024 * 1024,
        ))
        .layer(
            cors_layer
                .allow_methods(Any)
                .allow_headers(Any)
                .expose_headers(Any),
        )
        .with_state(state)
}

