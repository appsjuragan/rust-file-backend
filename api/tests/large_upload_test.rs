use aws_sdk_s3::config::{Credentials, Region};
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
use sea_orm::{ConnectionTrait, Database, EntityTrait};
use serde_json::Value;
use std::sync::Arc;
use tower::ServiceExt;

async fn setup_test_db() -> sea_orm::DatabaseConnection {
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
async fn test_large_file_uploads_and_dedup() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;

    // Custom Security Config allowing large files (e.g., 500MB)
    let mut sec_config = SecurityConfig::development();
    sec_config.max_file_size = 500 * 1024 * 1024; // 500 MB

    let scanner_service = Arc::new(NoOpScanner);
    let file_service = Arc::new(FileService::new(
        db.clone(),
        storage_service.clone(),
        scanner_service.clone(),
        sec_config.clone(),
    ));

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service.clone(),
        file_service: file_service.clone(),
        config: sec_config.clone(),
    };

    let app = create_app(state).layer(axum::extract::DefaultBodyLimit::max(
        sec_config.max_file_size,
    ));

    // -------------------------------------------------------------------------
    // 2. Authentication (Register & Login)
    // -------------------------------------------------------------------------

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/register")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"username": "bigfileuser", "password": "password123"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/login")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"username": "bigfileuser", "password": "password123"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body_bytes).unwrap();
    let token = json["token"].as_str().unwrap().to_string();

    // -------------------------------------------------------------------------
    // 3. Helper for Upload
    // -------------------------------------------------------------------------

    let upload_file = |size_mb: usize, filename: &str| {
        let app = app.clone();
        let token = token.clone();
        let filename = filename.to_string();
        async move {
            println!("Generating {}MB file...", size_mb);
            let size_bytes = size_mb * 1024 * 1024;
            let content = vec![(size_mb % 255) as u8; size_bytes];

            let boundary = "---------------------------boundary123";
            let header = format!(
                "--{boundary}\r\n\
                Content-Disposition: form-data; name=\"file\"; filename=\"{}.txt\"\r\n\
                Content-Type: text/plain\r\n\r\n",
                filename
            );
            let footer = format!("\r\n--{boundary}--\r\n");

            let mut full_body = Vec::new();
            full_body.extend_from_slice(header.as_bytes());
            full_body.extend_from_slice(&content);
            full_body.extend_from_slice(footer.as_bytes());

            let len = full_body.len();
            println!(
                "Uploading {}MB file (payload size: {} bytes)...",
                size_mb, len
            );

            let response = app
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/upload")
                        .header("Authorization", format!("Bearer {}", token))
                        .header(
                            "Content-Type",
                            format!("multipart/form-data; boundary={}", boundary),
                        )
                        .header("Content-Length", len)
                        .body(Body::from(full_body))
                        .unwrap(),
                )
                .await
                .unwrap();

            (
                response.status(),
                response.into_body().collect().await.unwrap().to_bytes(),
            )
        }
    };

    // -------------------------------------------------------------------------
    // 4. Perform Uploads
    // -------------------------------------------------------------------------

    // A. Upload 50MB
    println!("--- Testing 50MB Upload ---");
    let (status, body) = upload_file(50, "file_50mb.dat").await;
    if status != StatusCode::OK {
        println!("50MB Upload failed: {:?}", String::from_utf8_lossy(&body));
    }
    assert_eq!(status, StatusCode::OK);
    let json: Value = serde_json::from_slice(&body).unwrap();
    let id_50 = json["file_id"].as_str().unwrap().to_string();
    println!("50MB Upload success, ID: {}", id_50);

    // B. Upload 200MB
    println!("--- Testing 200MB Upload ---");
    let (status, body) = upload_file(200, "file_200mb.dat").await;
    if status != StatusCode::OK {
        println!("200MB Upload failed: {:?}", String::from_utf8_lossy(&body));
    }
    assert_eq!(status, StatusCode::OK);
    let json: Value = serde_json::from_slice(&body).unwrap();
    let id_200 = json["file_id"].as_str().unwrap().to_string();
    println!("200MB Upload success, ID: {}", id_200);

    // C. Upload 300MB
    println!("--- Testing 300MB Upload ---");
    let (status, body) = upload_file(300, "file_300mb.dat").await;
    if status != StatusCode::OK {
        println!("300MB Upload failed: {:?}", String::from_utf8_lossy(&body));
    }
    assert_eq!(status, StatusCode::OK);
    let json: Value = serde_json::from_slice(&body).unwrap();
    let id_300 = json["file_id"].as_str().unwrap().to_string();
    println!("300MB Upload success, ID: {}", id_300);

    // -------------------------------------------------------------------------
    // 5. Test Deduplication
    // -------------------------------------------------------------------------

    println!("--- Testing Deduplication (50MB Re-upload) ---");
    let (status, body) = upload_file(50, "file_50mb_copy.dat").await;
    assert_eq!(status, StatusCode::OK);
    let json: Value = serde_json::from_slice(&body).unwrap();
    let id_50_copy = json["file_id"].as_str().unwrap().to_string();

    assert_ne!(id_50, id_50_copy);
    println!("50MB Copy Upload success, New ID: {}", id_50_copy);

    // -------------------------------------------------------------------------
    // 6. Verification (DB & MinIO)
    // -------------------------------------------------------------------------

    // A. Get user file and associated storage file for 50MB
    let user_file_50 = UserFiles::find_by_id(id_50)
        .one(&db)
        .await
        .unwrap()
        .unwrap();
    let storage_file_50 = StorageFiles::find_by_id(user_file_50.storage_file_id.clone().unwrap())
        .one(&db)
        .await
        .unwrap()
        .unwrap();

    println!(
        "DB Check 50MB: Key={}, RefCount={}",
        storage_file_50.s3_key, storage_file_50.ref_count
    );
    assert_eq!(
        storage_file_50.ref_count, 2,
        "50MB file should have ref_count 2"
    );

    // Check that id_50_copy points to the same storage file
    let user_file_50_copy = UserFiles::find_by_id(id_50_copy)
        .one(&db)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        user_file_50.storage_file_id, user_file_50_copy.storage_file_id,
        "Both 50MB user files should point to same storage file"
    );

    // B. Verify MinIO Existence
    assert!(
        storage_service
            .file_exists(&storage_file_50.s3_key)
            .await
            .unwrap(),
        "50MB file validation in S3 failed"
    );
    println!("MinIO: 50MB file verified.");

    // 200MB File
    let user_file_200 = UserFiles::find_by_id(id_200)
        .one(&db)
        .await
        .unwrap()
        .unwrap();
    let storage_file_200 = StorageFiles::find_by_id(user_file_200.storage_file_id.clone().unwrap())
        .one(&db)
        .await
        .unwrap()
        .unwrap();
    assert!(
        storage_service
            .file_exists(&storage_file_200.s3_key)
            .await
            .unwrap(),
        "200MB file validation in S3 failed"
    );
    println!("MinIO: 200MB file verified.");

    // 300MB File
    let user_file_300 = UserFiles::find_by_id(id_300)
        .one(&db)
        .await
        .unwrap()
        .unwrap();
    let storage_file_300 = StorageFiles::find_by_id(user_file_300.storage_file_id.clone().unwrap())
        .one(&db)
        .await
        .unwrap()
        .unwrap();
    assert!(
        storage_service
            .file_exists(&storage_file_300.s3_key)
            .await
            .unwrap(),
        "300MB file validation in S3 failed"
    );
    println!("MinIO: 300MB file verified.");

    println!("All Large File & Dedup Tests Passed!");
}
