use aws_sdk_s3::config::Credentials;
use aws_sdk_s3::config::Region;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use rust_file_backend::config::SecurityConfig;
use rust_file_backend::services::scanner::NoOpScanner;
use rust_file_backend::services::storage::StorageService;
use rust_file_backend::{AppState, create_app};
use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Arc;
use tower::ServiceExt;

#[tokio::test]
async fn test_security_upload_restrictions() {
    // Setup in-memory DB
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();

    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    // Setup S3 client (Mock/MinIO)
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
    let storage_service = Arc::new(StorageService::new(s3_client, "uploads".to_string()));

    // Security Config
    let mut sec_config = SecurityConfig::default();
    sec_config.enable_virus_scan = false; // Disable for test to avoid needing ClamAV
    sec_config.virus_scanner_type = "noop".to_string();

    let state = AppState {
        db: pool.clone(),
        storage: storage_service.clone(),
        scanner: Arc::new(NoOpScanner),
        config: sec_config,
    };

    let app = create_app(state);

    // 1. Register & Login to get token
    let _ = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/register")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"username": "sec_user", "password": "password123"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/login")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"username": "sec_user", "password": "password123"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().unwrap();

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

    // Should probably fail validation
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
