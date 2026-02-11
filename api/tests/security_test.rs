use aws_sdk_s3::config::Credentials;
use aws_sdk_s3::config::Region;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use rust_file_backend::config::SecurityConfig;
use rust_file_backend::entities::prelude::*;
use rust_file_backend::services::file_service::FileService;
use rust_file_backend::services::scanner::NoOpScanner;
use rust_file_backend::services::storage::{S3StorageService, StorageService};
use rust_file_backend::{AppState, create_app};
use sea_orm::{ConnectionTrait, Database};
use std::sync::Arc;
use tower::ServiceExt;

async fn setup_test_db() -> sea_orm::DatabaseConnection {
    let _ = tracing_subscriber::fmt::try_init();
    unsafe { std::env::set_var("DATABASE_URL", "sqlite::memory:") };
    if std::env::var("JWT_SECRET").is_err() {
        unsafe { std::env::set_var("JWT_SECRET", "test_secret_for_security_tests") };
    }
    let db = Database::connect("sqlite::memory:").await.unwrap();
    rust_file_backend::infrastructure::database::run_migrations(&db)
        .await
        .unwrap();
    db
}

async fn setup_s3() -> Arc<dyn StorageService> {
    let config = aws_config::from_env()
        .endpoint_url("http://127.0.0.1:9000")
        .region(Region::new("us-east-1"))
        .credentials_provider(Credentials::new(
            "minioadmin",
            "minioadmin",
            None,
            None,
            "static",
        ))
        .load()
        .await;

    let s3_config = aws_sdk_s3::config::Builder::from(&config)
        .force_path_style(true)
        .build();

    let s3_client = aws_sdk_s3::Client::from_conf(s3_config);
    Arc::new(S3StorageService::new(s3_client, "uploads".to_string()))
}

#[tokio::test]
async fn test_security_upload_restrictions() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;

    // Security Config
    let mut sec_config = SecurityConfig::default();
    sec_config.enable_virus_scan = false;
    sec_config.virus_scanner_type = "noop".to_string();

    let scanner_service = Arc::new(NoOpScanner);
    let file_service = Arc::new(FileService::new(
        db.clone(),
        storage_service.clone(),
        scanner_service.clone(),
        sec_config.clone(),
    ));

    let upload_service = Arc::new(rust_file_backend::services::upload_service::UploadService::new(
        db.clone(),
        storage_service.clone(),
        sec_config.clone(),
        file_service.clone(),
    ));

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service.clone(),
        file_service: file_service.clone(),
        upload_service,
        config: sec_config,
        download_tickets: Arc::new(dashmap::DashMap::new()),
        captchas: Arc::new(dashmap::DashMap::new()),
        cooldowns: Arc::new(dashmap::DashMap::new()),
    };

    // Add a bypass CAPTCHA for testing register
    let captcha_id_reg = "test-captcha-reg".to_string();
    state.captchas.insert(captcha_id_reg.clone(), rust_file_backend::api::handlers::captcha::CaptchaChallenge {
        answer: 42,
        created_at: chrono::Utc::now(),
    });

    // Add a bypass CAPTCHA for testing login
    let captcha_id_login = "test-captcha-login".to_string();
    state.captchas.insert(captcha_id_login.clone(), rust_file_backend::api::handlers::captcha::CaptchaChallenge {
        answer: 43,
        created_at: chrono::Utc::now(),
    });

    let app = create_app(state);

    // 1. Register to get token
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/register")
                .header("Content-Type", "application/json")
                .body(Body::from(format!(
                    r#"{{"username": "sec_user", "password": "password123", "captcha_id": "{}", "captcha_answer": 42}}"#,
                    captcha_id_reg
                )))
                .unwrap(),
        )
        .await
        .unwrap();
    
    let status = response.status();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body_str = String::from_utf8_lossy(&body);
    assert_eq!(status, StatusCode::CREATED, "Register failed with status {}. Body: {}", status, body_str);

    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().expect(&format!("Token missing in registration response: {}", body_str));

    // 2. Test Path Traversal
    let boundary = "---------------------------123456789012345678901234567";
    let bad_filename_body = format!(
        "--{boundary}\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"../../../etc/passwd\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        Safe content\r\n\
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
                .body(Body::from(bad_filename_body))
                .unwrap(),
        )
        .await
        .unwrap();

    // Should succeed because we sanitize the filename to "passwd"
    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["filename"], "passwd");

    // 3. Test Disallowed Extension (.exe)
    let exe_body = format!(
        "--{boundary}\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"malware.exe\"\r\n\
        Content-Type: application/octet-stream\r\n\r\n\
        MZ content\r\n\
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
                .body(Body::from(exe_body))
                .unwrap(),
        )
        .await
        .unwrap();

    // Should fail validation
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_security_headers_present() {
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
        db,
        storage: storage_service,
        scanner: scanner_service,
        file_service,
        upload_service,
        config,
        download_tickets: Arc::new(dashmap::DashMap::new()),
        captchas: Arc::new(dashmap::DashMap::new()),
        cooldowns: Arc::new(dashmap::DashMap::new()),
    };

    let app = create_app(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let headers = response.headers();

    assert_eq!(headers.get("x-frame-options").unwrap(), "DENY");
    assert_eq!(headers.get("x-content-type-options").unwrap(), "nosniff");
    assert!(headers.get("content-security-policy").unwrap().to_str().unwrap().contains("default-src 'none'"));
    assert_eq!(headers.get("referrer-policy").unwrap(), "strict-origin-when-cross-origin");
    assert_eq!(headers.get("server").unwrap(), "rust-file-backend");
}

#[tokio::test]
async fn test_reject_trace_method() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;
    let scanner_service = Arc::new(NoOpScanner);
    let config = SecurityConfig::development();

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service,
        file_service: Arc::new(FileService::new(db.clone(), storage_service.clone(), Arc::new(NoOpScanner), config.clone())),
        upload_service: Arc::new(rust_file_backend::services::upload_service::UploadService::new(db.clone(), storage_service.clone(), config.clone(), Arc::new(FileService::new(db.clone(), storage_service.clone(), Arc::new(NoOpScanner), config.clone())))),
        config,
        download_tickets: Arc::new(dashmap::DashMap::new()),
        captchas: Arc::new(dashmap::DashMap::new()),
        cooldowns: Arc::new(dashmap::DashMap::new()),
    };

    let app = create_app(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("TRACE")
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
}
