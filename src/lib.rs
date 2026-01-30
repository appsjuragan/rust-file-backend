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
// use axum::http::{Method, header};

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
        api::handlers::user_settings::get_settings,
        api::handlers::user_settings::update_settings,
        api::handlers::user_settings::update_settings,
        api::handlers::health::health_check,
        api::handlers::users::get_profile,
        api::handlers::users::update_profile,
        api::handlers::users::upload_avatar,
        api::handlers::users::get_avatar,
        api::handlers::users::get_user_facts,
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
            api::handlers::user_settings::UpdateUserSettingsRequest,
            api::handlers::health::HealthResponse,
            api::handlers::users::UserProfileResponse,
            api::handlers::users::UpdateProfileRequest,
            api::handlers::users::AvatarResponse,
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
        .route("/auth/oidc/login", get(api::handlers::auth::login_oidc))
        .route(
            "/auth/oidc/callback",
            get(api::handlers::auth::callback_oidc),
        )
        .route(
            "/pre-check",
            post(api::handlers::files::pre_check_dedup).layer(from_fn_with_state(
                state.clone(),
                api::middleware::auth::auth_middleware,
            )),
        )
        .route(
            "/files/link",
            post(api::handlers::files::link_file).layer(from_fn_with_state(
                state.clone(),
                api::middleware::auth::auth_middleware,
            )),
        )
        .route(
            "/upload",
            post(api::handlers::files::upload_file)
                .layer(axum::extract::DefaultBodyLimit::max(
                    state.config.max_file_size + 10 * 1024 * 1024, // Add 10MB buffer for multipart overhead
                ))
                .layer(from_fn_with_state(
                    state.clone(),
                    api::middleware::auth::auth_middleware,
                )),
        )
        .route(
            "/files/:id",
            get(api::handlers::files::download_file)
                .delete(api::handlers::files::delete_item)
                .layer(from_fn_with_state(
                    state.clone(),
                    api::middleware::auth::auth_middleware,
                )),
        )
        .route(
            "/files/:id/rename",
            axum::routing::put(api::handlers::files::rename_item).layer(from_fn_with_state(
                state.clone(),
                api::middleware::auth::auth_middleware,
            )),
        )
        .route(
            "/files/:id/path",
            get(api::handlers::files::get_folder_path).layer(from_fn_with_state(
                state.clone(),
                api::middleware::auth::auth_middleware,
            )),
        )
        .route(
            "/files/:id/zip-contents",
            get(api::handlers::files::get_zip_contents).layer(from_fn_with_state(
                state.clone(),
                api::middleware::auth::auth_middleware,
            )),
        )
        .route(
            "/files",
            get(api::handlers::files::list_files).layer(from_fn_with_state(
                state.clone(),
                api::middleware::auth::auth_middleware,
            )),
        )
        .route(
            "/folders",
            post(api::handlers::files::create_folder).layer(from_fn_with_state(
                state.clone(),
                api::middleware::auth::auth_middleware,
            )),
        )
        .route(
            "/files/bulk-delete",
            post(api::handlers::files::bulk_delete).layer(from_fn_with_state(
                state.clone(),
                api::middleware::auth::auth_middleware,
            )),
        )
        .route(
            "/files/bulk-move",
            post(api::handlers::files::bulk_move).layer(from_fn_with_state(
                state.clone(),
                api::middleware::auth::auth_middleware,
            )),
        )
        .route(
            "/settings",
            get(api::handlers::user_settings::get_settings)
                .put(api::handlers::user_settings::update_settings)
                .layer(from_fn_with_state(
                    state.clone(),
                    api::middleware::auth::auth_middleware,
                )),
        )
        .route(
            "/users/me",
            get(api::handlers::users::get_profile)
                .put(api::handlers::users::update_profile)
                .layer(from_fn_with_state(
                    state.clone(),
                    api::middleware::auth::auth_middleware,
                )),
        )
        .route(
            "/users/me/avatar",
            get(api::handlers::users::get_avatar)
                .post(api::handlers::users::upload_avatar)
                .layer(from_fn_with_state(
                    state.clone(),
                    api::middleware::auth::auth_middleware,
                )),
        )
        .route(
            "/users/me/facts",
            get(api::handlers::users::get_user_facts).layer(from_fn_with_state(
                state.clone(),
                api::middleware::auth::auth_middleware,
            )),
        )
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any)
                .expose_headers(Any),
        )
        .layer(axum::extract::DefaultBodyLimit::max(
            state.config.max_file_size + 10 * 1024 * 1024,
        ))
        .with_state(state)
}
