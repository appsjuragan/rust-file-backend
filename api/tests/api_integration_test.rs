use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use rust_file_backend::config::SecurityConfig;
use rust_file_backend::entities::{prelude::*, *};
use rust_file_backend::services::scanner::NoOpScanner;
use rust_file_backend::infrastructure::database;
use tracing_subscriber::{fmt, EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};
use rust_file_backend::services::file_service::FileService;
use rust_file_backend::{AppState, create_app};
use sea_orm::{Database, EntityTrait};
use serde_json::Value;
use std::sync::Arc;
use tower::ServiceExt;

async fn setup_test_db() -> sea_orm::DatabaseConnection {
    unsafe { std::env::set_var("DATABASE_URL", "sqlite::memory:"); }
    let db = Database::connect("sqlite::memory:").await.unwrap();
    database::run_migrations(&db).await.unwrap();
    db
}

use async_trait::async_trait;
use aws_sdk_s3::primitives::ByteStream;
use rust_file_backend::services::storage::{StorageService, UploadResult};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::io::{AsyncRead, AsyncReadExt};

struct MockStorageService {
    files: Mutex<HashMap<String, Vec<u8>>>,
}

impl MockStorageService {
    fn new() -> Self {
        Self {
            files: Mutex::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl StorageService for MockStorageService {
    async fn upload_file(&self, key: &str, data: Vec<u8>) -> anyhow::Result<()> {
        self.files.lock().unwrap().insert(key.to_string(), data);
        Ok(())
    }

    async fn upload_stream_with_hash<'a>(
        &self,
        key: &str,
        mut reader: Box<dyn AsyncRead + Unpin + Send + 'a>,
    ) -> anyhow::Result<UploadResult> {
        let mut data = Vec::new();
        reader.read_to_end(&mut data).await?;

        let mut hasher = Sha256::new();
        hasher.update(&data);
        let hash = hex::encode(hasher.finalize());
        let size = data.len() as i64;

        self.files.lock().unwrap().insert(key.to_string(), data);

        Ok(UploadResult {
            hash,
            size,
            s3_key: key.to_string(),
        })
    }

    async fn copy_object(&self, source_key: &str, dest_key: &str) -> anyhow::Result<()> {
        let data = self.files.lock().unwrap().get(source_key).cloned();
        if let Some(data) = data {
            self.files
                .lock()
                .unwrap()
                .insert(dest_key.to_string(), data);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Source key not found"))
        }
    }

    async fn delete_file(&self, key: &str) -> anyhow::Result<()> {
        self.files.lock().unwrap().remove(key);
        Ok(())
    }

    async fn file_exists(&self, key: &str) -> anyhow::Result<bool> {
        Ok(self.files.lock().unwrap().contains_key(key))
    }

    async fn generate_presigned_url(
        &self,
        key: &str,
        _expires_in_secs: u64,
        _content_type: &str,
        _content_disposition: &str,
    ) -> anyhow::Result<String> {
        Ok(format!("/obj/mock-bucket/{}?X-Amz-Mock=true", key))
    }

    async fn get_object_stream(
        &self,
        key: &str,
    ) -> anyhow::Result<aws_sdk_s3::operation::get_object::GetObjectOutput> {
        let data = self
            .files
            .lock()
            .unwrap()
            .get(key)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Key not found"))?;
        Ok(
            aws_sdk_s3::operation::get_object::GetObjectOutput::builder()
                .body(ByteStream::from(data))
                .build(),
        )
    }

    async fn get_object_range(
        &self,
        key: &str,
        _range: &str,
    ) -> anyhow::Result<aws_sdk_s3::operation::get_object::GetObjectOutput> {
        self.get_object_stream(key).await
    }
    async fn get_file(&self, key: &str) -> anyhow::Result<Vec<u8>> {
        self.files
            .lock()
            .unwrap()
            .get(key)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Key not found"))
    }
    async fn list_objects(&self, prefix: &str) -> anyhow::Result<Vec<String>> {
        let files = self.files.lock().unwrap();
        Ok(files
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect())
    }
    async fn get_object_metadata(
        &self,
        key: &str,
    ) -> anyhow::Result<rust_file_backend::services::storage::FileMetadata> {
        let files = self.files.lock().unwrap();
        let data = files
            .get(key)
            .ok_or_else(|| anyhow::anyhow!("Key not found"))?;
        Ok(rust_file_backend::services::storage::FileMetadata {
            last_modified: Some(chrono::Utc::now()),
            size: data.len() as i64,
        })
    }

    async fn create_multipart_upload(&self, _key: &str) -> anyhow::Result<String> {
        Ok("mock-upload-id".to_string())
    }

    async fn upload_part(
        &self,
        _key: &str,
        _upload_id: &str,
        _part_number: i32,
        _data: Vec<u8>,
    ) -> anyhow::Result<String> {
        Ok("mock-etag".to_string())
    }

    async fn complete_multipart_upload(
        &self,
        _key: &str,
        _upload_id: &str,
        _parts: Vec<(i32, String)>,
    ) -> anyhow::Result<()> {
        Ok(())
    }

    async fn abort_multipart_upload(&self, _key: &str, _upload_id: &str) -> anyhow::Result<()> {
        Ok(())
    }
}

async fn setup_s3() -> Arc<dyn StorageService> {
    Arc::new(MockStorageService::new())
}

#[tokio::test]
async fn test_full_api_flow() {
    let _ = tracing_subscriber::registry()
        .with(EnvFilter::new("rust_file_backend=debug,tower_http=debug"))
        .with(fmt::layer().with_test_writer())
        .try_init();

    let db = setup_test_db().await;
    let storage_service = setup_s3().await;
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

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service.clone(),
        file_service: file_service.clone(),
        upload_service,
        config: config.clone(),
        download_tickets: Arc::new(dashmap::DashMap::new()),
        captchas: Arc::new(dashmap::DashMap::new()),
        cooldowns: Arc::new(dashmap::DashMap::new()),
    };

    let captcha_id = "test-captcha-id".to_string();
    let captcha_answer = 42;
    state.captchas.insert(
        captcha_id.clone(),
        rust_file_backend::api::handlers::captcha::CaptchaChallenge {
            answer: captcha_answer,
            created_at: chrono::Utc::now(),
        },
    );

    let app = create_app(state.clone());

    // 1. Register
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/register")
                .header("Content-Type", "application/json")
                .body(Body::from(format!(
                    r#"{{"username": "api_test_user", "password": "password123", "captcha_id": "{}", "captcha_answer": {}}}"#,
                    captcha_id, captcha_answer
                )))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    // 2. Login
    let captcha_id = "test-captcha-id-2".to_string();
    let captcha_answer = 42;
    state.captchas.insert(
        captcha_id.clone(),
        rust_file_backend::api::handlers::captcha::CaptchaChallenge {
            answer: captcha_answer,
            created_at: chrono::Utc::now(),
        },
    );

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/login")
                .header("Content-Type", "application/json")
                .body(Body::from(format!(
                    r#"{{"username": "api_test_user", "password": "password123", "captcha_id": "{}", "captcha_answer": {}}}"#,
                    captcha_id, captcha_answer
                )))
                .unwrap(),
        )
        .await
        .unwrap();

    if response.status() != StatusCode::OK {
        let status = response.status();
        let body = axum::body::to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        panic!("Login failed: {} - {:?}", status, String::from_utf8_lossy(&body));
    }
    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().unwrap();

    // 3. Upload File
    let boundary = "---------------------------123456789012345678901234567";
    let multipart_body = format!(
        "--{boundary}\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"api_test.txt\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        Integration test content\r\n\
        --{boundary}--\r\n",
        boundary = boundary
    );

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/upload")
                .header("Authorization", format!("Bearer {}", token))
                .header(
                    "Content-Type",
                    format!("multipart/form-data; boundary={}", boundary),
                )
                .body(Body::from(multipart_body))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = response.into_body().collect().await.unwrap().to_bytes();

    if status != StatusCode::OK {
        println!("Upload failed: {:?}", String::from_utf8_lossy(&body));
    }
    assert_eq!(status, StatusCode::OK);

    let json: Value = serde_json::from_slice(&body).unwrap();
    let file_id = json["file_id"].as_str().unwrap();

    // 4. List Files
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/files")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let files: Vec<Value> = serde_json::from_slice(&body).unwrap();

    assert!(files.iter().any(|f| f["id"].as_str() == Some(file_id)));

    // 5. Download File (now returns 302 redirect to presigned URL)
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(&format!("/files/{}", file_id))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::FOUND);
    let location = response.headers().get("location").unwrap().to_str().unwrap();
    assert!(location.contains("/obj/"));

    // 6. Delete File
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(&format!("/files/{}", file_id))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // 7. Verify Deletion (Soft Delete)
    let user_file = UserFiles::find_by_id(file_id)
        .one(&db)
        .await
        .unwrap()
        .unwrap();

    assert!(user_file.deleted_at.is_some());
}
