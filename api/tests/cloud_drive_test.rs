use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use rust_file_backend::config::SecurityConfig;
use rust_file_backend::entities::{prelude::*, *};
use rust_file_backend::services::scanner::NoOpScanner;
use rust_file_backend::infrastructure::database;
use rust_file_backend::services::file_service::FileService;
use rust_file_backend::services::cloud_provider_manager::CloudProviderManager;
use rust_file_backend::services::cloud_providers::{CloudProvider, CloudTokens, CloudFile, CloudFileStream};
use rust_file_backend::{AppState, create_app};
use sea_orm::{Database, EntityTrait, ActiveModelTrait, Set};
use serde_json::Value;
use std::sync::Arc;
use tower::ServiceExt;
use async_trait::async_trait;
use tokio::io::AsyncRead;

// Mock Storage Helper from api_integration_test.rs
struct MockStorageService;
#[async_trait]
impl rust_file_backend::services::storage::StorageService for MockStorageService {
    async fn upload_file(&self, _key: &str, _data: Vec<u8>) -> anyhow::Result<()> { Ok(()) }
    async fn upload_stream_with_hash<'a>(&self, key: &str, _reader: Box<dyn AsyncRead + Unpin + Send + 'a>) -> anyhow::Result<rust_file_backend::services::storage::UploadResult> {
        Ok(rust_file_backend::services::storage::UploadResult { hash: "test".to_string(), size: 0, s3_key: key.to_string() })
    }
    async fn copy_object(&self, _source_key: &str, _dest_key: &str) -> anyhow::Result<()> { Ok(()) }
    async fn delete_file(&self, _key: &str) -> anyhow::Result<()> { Ok(()) }
    async fn file_exists(&self, _key: &str) -> anyhow::Result<bool> { Ok(true) }
    async fn get_download_url(&self, _key: &str) -> anyhow::Result<String> { Ok("http://mock".to_string()) }
    async fn get_object_stream(&self, _key: &str) -> anyhow::Result<aws_sdk_s3::operation::get_object::GetObjectOutput> {
         Err(anyhow::anyhow!("Not implemented"))
    }
    async fn get_object_range(&self, _key: &str, _range: &str) -> anyhow::Result<aws_sdk_s3::operation::get_object::GetObjectOutput> {
         Err(anyhow::anyhow!("Not implemented"))
    }
    async fn get_file(&self, _key: &str) -> anyhow::Result<Vec<u8>> { Ok(vec![]) }
    async fn list_objects(&self, _prefix: &str) -> anyhow::Result<Vec<String>> { Ok(vec![]) }
    async fn get_object_metadata(&self, _key: &str) -> anyhow::Result<rust_file_backend::services::storage::FileMetadata> {
        Ok(rust_file_backend::services::storage::FileMetadata { last_modified: Some(chrono::Utc::now()), size: 0 })
    }
    async fn create_multipart_upload(&self, _key: &str) -> anyhow::Result<String> { Ok("mock_id".to_string()) }
    async fn upload_part(&self, _key: &str, _uid: &str, _pn: i32, _data: Vec<u8>) -> anyhow::Result<String> { Ok("etag".to_string()) }
    async fn complete_multipart_upload(&self, _key: &str, _uid: &str, _parts: Vec<(i32, String)>) -> anyhow::Result<()> { Ok(()) }
    async fn abort_multipart_upload(&self, _key: &str, _uid: &str) -> anyhow::Result<()> { Ok(()) }
}

// Mock Cloud Provider for Testing Manager
struct TestCloudProvider;
#[async_trait]
impl CloudProvider for TestCloudProvider {
    fn provider_id(&self) -> &'static str { "test_provider" }
    fn display_name(&self) -> &'static str { "Test Provider" }
    fn get_auth_url(&self, state: &str) -> String { format!("http://test.com/auth?state={}", state) }
    async fn exchange_code(&self, _code: &str) -> anyhow::Result<CloudTokens> {
        Ok(CloudTokens {
            access_token: "access_123".to_string(),
            refresh_token: Some("refresh_123".to_string()),
            expires_at: chrono::Utc::now() + chrono::Duration::hours(1),
            email: Some("test@test.com".to_string()),
        })
    }
    async fn refresh_token(&self, _refresh_token: &str) -> anyhow::Result<CloudTokens> {
        Ok(CloudTokens {
            access_token: "access_new".to_string(),
            refresh_token: Some("refresh_new".to_string()),
            expires_at: chrono::Utc::now() + chrono::Duration::hours(1),
            email: None,
        })
    }
    async fn list_files(&self, _at: &str, _fid: Option<&str>) -> anyhow::Result<Vec<CloudFile>> {
        Ok(vec![CloudFile { id: "f1".to_string(), name: "file1.txt".to_string(), mime_type: "text/plain".to_string(), size: Some(5), is_folder: false, modified_at: None, parent_id: None }])
    }
    async fn download_file(&self, _at: &str, _fid: &str) -> anyhow::Result<CloudFileStream> {
        Ok(CloudFileStream { filename: "file1.txt".to_string(), content: b"hello".to_vec(), mime_type: "text/plain".to_string(), size: 5 })
    }
    async fn upload_file(&self, _at: &str, _name: &str, _pid: Option<&str>, _data: Vec<u8>, _mt: &str) -> anyhow::Result<CloudFile> {
        Ok(CloudFile { id: "f2".to_string(), name: "up.txt".to_string(), mime_type: "text/plain".to_string(), size: Some(10), is_folder: false, modified_at: None, parent_id: None })
    }
    async fn get_file_info(&self, _at: &str, _fid: &str) -> anyhow::Result<CloudFile> {
        Ok(CloudFile { id: "f1".to_string(), name: "file1.txt".to_string(), mime_type: "text/plain".to_string(), size: Some(5), is_folder: false, modified_at: None, parent_id: None })
    }
    async fn revoke_token(&self, _token: &str) -> anyhow::Result<()> { Ok(()) }
}

async fn setup_app() -> (axum::Router, AppState) {
    let db = Database::connect("sqlite::memory:").await.unwrap();
    database::run_migrations(&db).await.unwrap();
    
    let storage_service = Arc::new(MockStorageService);
    let scanner_service = Arc::new(NoOpScanner);
    let config = SecurityConfig::development();
    
    let file_service = Arc::new(FileService::new(
        db.clone(),
        storage_service.clone(),
        scanner_service.clone(),
        config.clone(),
    ));

    let upload_service = Arc::new(rust_file_backend::services::upload_service::UploadService::new(
        db.clone(),
        storage_service.clone(),
        config.clone(),
        file_service.clone(),
    ));

    let mut cloud_manager = CloudProviderManager::new(db.clone());
    cloud_manager.register(Arc::new(TestCloudProvider));

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service.clone(),
        file_service,
        upload_service,
        config: config.clone(),
        download_tickets: Arc::new(dashmap::DashMap::new()),
        cloud_provider_manager: Arc::new(cloud_manager),
        captchas: Arc::new(dashmap::DashMap::new()),
        cooldowns: Arc::new(dashmap::DashMap::new()),
    };

    (create_app(state.clone()), state)
}

#[tokio::test]
async fn test_cloud_manager_token_lifecycle() {
    let db = Database::connect("sqlite::memory:").await.unwrap();
    database::run_migrations(&db).await.unwrap();
    
    let mut manager = CloudProviderManager::new(db.clone());
    manager.register(Arc::new(TestCloudProvider));
    
    let user_id = "user_1";
    
    // Create user to satisfy FK
    let user = users::ActiveModel {
        id: Set(user_id.to_string()),
        username: Set("lifecycle_user".to_string()),
        ..Default::default()
    };
    user.insert(&db).await.unwrap();

    let provider_id = "test_provider";
    
    // 1. Store tokens
    let tokens = CloudTokens {
        access_token: "initial_access".to_string(),
        refresh_token: Some("initial_refresh".to_string()),
        expires_at: chrono::Utc::now() + chrono::Duration::hours(1),
        email: Some("user@test.com".to_string()),
    };
    
    manager.store_tokens(user_id, provider_id, tokens).await.unwrap();
    
    // 2. Get valid token (not expired)
    let token = manager.get_valid_token(user_id, provider_id).await.unwrap();
    assert_eq!(token, "initial_access");
    
    // 3. Mark as expired in DB
    use rust_file_backend::entities::cloud_provider_tokens;
    use rust_file_backend::entities::prelude::CloudProviderTokens;
    let record = CloudProviderTokens::find().one(&db).await.unwrap().unwrap();
    let mut active: cloud_provider_tokens::ActiveModel = record.into();
    active.token_expires_at = Set(chrono::Utc::now() - chrono::Duration::minutes(10));
    active.update(&db).await.unwrap();
    
    // 4. Get valid token (should trigger refresh)
    let token = manager.get_valid_token(user_id, provider_id).await.unwrap();
    assert_eq!(token, "access_new"); // from Mock refresh_token
}

#[tokio::test]
async fn test_cloud_api_endpoints() {
    let (app, state) = setup_app().await;

    // 1. Ensure a user exists and get token
    let user_id = "test_user_id";
    let user = users::ActiveModel {
        id: Set(user_id.to_string()),
        username: Set("cloud_tester".to_string()),
        ..Default::default()
    };
    user.insert(&state.db).await.unwrap();
    
    let jwt_secret = &state.config.jwt_secret;
    let token = rust_file_backend::utils::auth::create_jwt(user_id, jwt_secret).unwrap();

    // 2. List Providers
    let response = app.clone().oneshot(
        Request::builder()
            .method("GET")
            .uri("/cloud/providers")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap(),
    ).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let providers: Vec<Value> = serde_json::from_slice(&body).unwrap();
    assert!(providers.iter().any(|p| p["id"] == "test_provider"));

    // 3. Connect (Auth URL)
    let response = app.clone().oneshot(
        Request::builder()
            .method("GET")
            .uri("/cloud/test_provider/connect")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap(),
    ).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let url: String = serde_json::from_slice(&body).unwrap();
    assert!(url.contains("http://test.com/auth"));

    // 4. Callback (Public)
    let response = app.clone().oneshot(
        Request::builder()
            .method("GET")
            .uri(&format!("/cloud/test_provider/callback?code=abc&state={}", user_id))
            .body(Body::empty())
            .unwrap(),
    ).await.unwrap();

    assert_eq!(response.status(), StatusCode::SEE_OTHER); // Redirect

    // 5. List Cloud Files
    let response = app.clone().oneshot(
        Request::builder()
            .method("GET")
            .uri("/cloud/test_provider/files")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap(),
    ).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let files: Vec<Value> = serde_json::from_slice(&body).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0]["name"], "file1.txt");

    // 6. Disconnect
    let response = app.clone().oneshot(
        Request::builder()
            .method("DELETE")
            .uri("/cloud/test_provider/disconnect")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap(),
    ).await.unwrap();

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}
