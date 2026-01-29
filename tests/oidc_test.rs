use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use rust_file_backend::config::SecurityConfig;
use rust_file_backend::services::scanner::NoOpScanner;
use rust_file_backend::infrastructure::database;
use rust_file_backend::services::file_service::FileService;
use rust_file_backend::{AppState, create_app};
use sea_orm::Database;
use std::sync::Arc;
use tower::ServiceExt;

fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("debug")
        .try_init();
}

async fn setup_test_db() -> sea_orm::DatabaseConnection {
    let db = Database::connect("sqlite::memory:").await.unwrap();
    database::run_migrations(&db).await.unwrap();
    db
}

async fn setup_s3() -> Arc<dyn rust_file_backend::services::storage::StorageService> {
    // We can use the MockStorageService from api_integration_test.rs if we make it public or copy it.
    // For OIDC tests, storage is not critical, so we can use a dummy implementation or copy the mock.
    // To avoid code duplication, we'll implement a minimal mock here.
    Arc::new(MockStorageService)
}

struct MockStorageService;
#[async_trait::async_trait]
impl rust_file_backend::services::storage::StorageService for MockStorageService {
    async fn upload_file(&self, _key: &str, _data: Vec<u8>) -> anyhow::Result<()> { Ok(()) }
    async fn upload_stream_with_hash<'a>(&self, key: &str, _reader: Box<dyn tokio::io::AsyncRead + Unpin + Send + 'a>) -> anyhow::Result<rust_file_backend::services::storage::UploadResult> {
        Ok(rust_file_backend::services::storage::UploadResult { hash: "hash".to_string(), size: 0, s3_key: key.to_string() })
    }
    async fn copy_object(&self, _source: &str, _dest: &str) -> anyhow::Result<()> { Ok(()) }
    async fn delete_file(&self, _key: &str) -> anyhow::Result<()> { Ok(()) }
    async fn file_exists(&self, _key: &str) -> anyhow::Result<bool> { Ok(false) }
    async fn get_download_url(&self, _key: &str) -> anyhow::Result<String> { Ok("url".to_string()) }
    async fn get_object_stream(&self, _key: &str) -> anyhow::Result<aws_sdk_s3::operation::get_object::GetObjectOutput> { Err(anyhow::anyhow!("not impl")) }
    async fn get_object_range(&self, _key: &str, _range: &str) -> anyhow::Result<aws_sdk_s3::operation::get_object::GetObjectOutput> { Err(anyhow::anyhow!("not impl")) }
}

#[tokio::test]
async fn test_oidc_login_redirect() {
    init_tracing();
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;
    let scanner_service = Arc::new(NoOpScanner);
    
    let mut config = SecurityConfig::development();
    config.oidc_issuer_url = Some("http://localhost:9100".to_string());
    config.oidc_client_id = Some("foo".to_string());
    config.oidc_client_secret = Some("bar".to_string());
    config.oidc_redirect_url = Some("http://127.0.0.1:3000/auth/oidc/callback".to_string());
    config.oidc_skip_discovery = true;

    let file_service = Arc::new(FileService::new(
        db.clone(),
        storage_service.clone(),
        scanner_service.clone(),
        config.clone(),
    ));

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service.clone(),
        file_service: file_service.clone(),
        config: config.clone(),
    };

    let app = create_app(state);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/auth/oidc/login")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let location = response.headers().get("location").unwrap().to_str().unwrap();
    assert!(location.starts_with("http://localhost:9100/auth"));
    assert!(location.contains("client_id=foo"));
    assert!(location.contains("response_type=code"));
    assert!(location.contains("scope=openid+email+profile"));
}

#[tokio::test]
async fn test_oidc_callback_invalid_code() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;
    let scanner_service = Arc::new(NoOpScanner);
    
    let mut config = SecurityConfig::development();
    config.oidc_issuer_url = Some("http://localhost:9100".to_string());
    config.oidc_client_id = Some("foo".to_string());
    config.oidc_client_secret = Some("bar".to_string());
    config.oidc_redirect_url = Some("http://127.0.0.1:3000/auth/oidc/callback".to_string());
    config.oidc_skip_discovery = true;

    let file_service = Arc::new(FileService::new(
        db.clone(),
        storage_service.clone(),
        scanner_service.clone(),
        config.clone(),
    ));

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service.clone(),
        file_service: file_service.clone(),
        config: config.clone(),
    };

    let app = create_app(state);

    // Provide an invalid code
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/auth/oidc/callback?code=invalid_code&state=some_state")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Should fail with 500 Internal Server Error (or whatever AppError::Internal maps to)
    // The error message would be "Token exchange failed: ..."
    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

#[tokio::test]
async fn test_oidc_callback_missing_params() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;
    let scanner_service = Arc::new(NoOpScanner);
    
    let mut config = SecurityConfig::development();
    config.oidc_issuer_url = Some("http://localhost:9100".to_string());
    config.oidc_client_id = Some("foo".to_string());
    config.oidc_client_secret = Some("bar".to_string());
    config.oidc_redirect_url = Some("http://127.0.0.1:3000/auth/oidc/callback".to_string());
    config.oidc_skip_discovery = true;

    let file_service = Arc::new(FileService::new(
        db.clone(),
        storage_service.clone(),
        scanner_service.clone(),
        config.clone(),
    ));

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service.clone(),
        file_service: file_service.clone(),
        config: config.clone(),
    };

    let app = create_app(state);

    // Missing code and state
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/auth/oidc/callback")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Should fail with 400 Bad Request because Query deserialization fails
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
