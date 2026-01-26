use aws_sdk_s3::config::{Credentials, Region};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt; // For checking response body
use rust_file_backend::config::SecurityConfig;
use rust_file_backend::services::scanner::NoOpScanner;
use rust_file_backend::services::storage::StorageService;
use rust_file_backend::{AppState, create_app};
use serde_json::Value;
use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Arc;
use tower::ServiceExt;

#[tokio::test]
async fn test_large_file_uploads_and_dedup() {
    // -------------------------------------------------------------------------
    // 1. Setup Environment (DB, S3, App)
    // -------------------------------------------------------------------------

    // In-memory SQLite
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();

    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    // S3 Config (MinIO)
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
    // Use a unique bucket or prefix if needed, but "uploads" is standard
    let storage_service = Arc::new(StorageService::new(
        s3_client.clone(),
        "uploads".to_string(),
    ));

    // Custom Security Config allowing large files (e.g., 500MB)
    let mut sec_config = SecurityConfig::development();
    sec_config.max_file_size = 500 * 1024 * 1024; // 500 MB

    let state = AppState {
        db: pool.clone(),
        storage: storage_service.clone(),
        scanner: Arc::new(NoOpScanner),
        config: sec_config.clone(),
    };

    // Create App and apply Body Limit Layer
    let app = create_app(state).layer(axum::extract::DefaultBodyLimit::max(
        sec_config.max_file_size,
    ));

    // -------------------------------------------------------------------------
    // 2. Authentication (Register & Login)
    // -------------------------------------------------------------------------

    // Register
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

    // Login
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

    // We'll define a closure or function to perform upload
    // using the valid token and app.
    // Since Step Id 0 asked for 50MB, 200MB, 300MB specifically:

    let upload_file = |size_mb: usize, filename: &str| {
        let app = app.clone();
        let token = token.clone();
        let filename = filename.to_string();
        async move {
            println!("Generating {}MB file...", size_mb);
            let size_bytes = size_mb * 1024 * 1024;
            // Use a pattern based on size to ensure uniqueness between 50/200/300,
            // but consistent for dedup checks of the same size.
            // Using a simple repeating byte is efficient.
            // To differentiate files of same size (if needed), add a seed, but here
            // 50, 200, 300 are distinct by size.
            let content = vec![(size_mb % 255) as u8; size_bytes];

            let boundary = "---------------------------boundary123";
            let header = format!(
                "--{boundary}\r\n\
                Content-Disposition: form-data; name=\"file\"; filename=\"{}.txt\"\r\n\
                Content-Type: text/plain\r\n\r\n",
                filename
            );
            let footer = format!("\r\n--{boundary}--\r\n");

            // Construct body: Header + Content + Footer
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
        // If it fails with 413, check body limit.
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

    // Upload 50MB again (Same content as A)
    println!("--- Testing Deduplication (50MB Re-upload) ---");
    let (status, body) = upload_file(50, "file_50mb_copy.dat").await;
    assert_eq!(status, StatusCode::OK);
    let json: Value = serde_json::from_slice(&body).unwrap();
    let id_50_copy = json["file_id"].as_str().unwrap().to_string();

    // The user file IDs should be different
    assert_ne!(id_50, id_50_copy);
    println!("50MB Copy Upload success, New ID: {}", id_50_copy);

    // -------------------------------------------------------------------------
    // 6. Verification (DB & MinIO)
    // -------------------------------------------------------------------------

    // A. Verify DB State (Deduplication)
    // We expect:
    // - 1 storage_file for the 50MB content (ref_count = 2)
    // - 1 storage_file for 200MB (ref_count = 1)
    // - 1 storage_file for 300MB (ref_count = 1)

    // Check 50MB storage file
    let storage_50: (String, i32) = sqlx::query_as(
        "SELECT s3_key, ref_count FROM storage_files 
         JOIN user_files ON storage_files.id = user_files.storage_file_id 
         WHERE user_files.id = ?",
    )
    .bind(&id_50)
    .fetch_one(&pool)
    .await
    .unwrap();

    let (key_50, ref_50) = storage_50;
    println!("DB Check 50MB: Key={}, RefCount={}", key_50, ref_50);
    assert_eq!(ref_50, 2, "50MB file should have ref_count 2");

    // Check that id_50_copy points to the same key
    let key_50_copy: String = sqlx::query_scalar(
        "SELECT s3_key FROM storage_files 
         JOIN user_files ON storage_files.id = user_files.storage_file_id 
         WHERE user_files.id = ?",
    )
    .bind(&id_50_copy)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(
        key_50, key_50_copy,
        "Both 50MB user files should point to same storage file"
    );

    // B. Verify MinIO Existence
    // We check if the keys exist in the bucket.

    // 50MB File
    assert!(
        storage_service.file_exists(&key_50).await.unwrap(),
        "50MB file validation in S3 failed"
    );
    println!("MinIO: 50MB file verified.");

    // 200MB File
    let key_200: String = sqlx::query_scalar(
        "SELECT s3_key FROM storage_files 
         JOIN user_files ON storage_files.id = user_files.storage_file_id 
         WHERE user_files.id = ?",
    )
    .bind(&id_200)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        storage_service.file_exists(&key_200).await.unwrap(),
        "200MB file validation in S3 failed"
    );
    println!("MinIO: 200MB file verified.");

    // 300MB File
    let key_300: String = sqlx::query_scalar(
        "SELECT s3_key FROM storage_files 
         JOIN user_files ON storage_files.id = user_files.storage_file_id 
         WHERE user_files.id = ?",
    )
    .bind(&id_300)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(
        storage_service.file_exists(&key_300).await.unwrap(),
        "300MB file validation in S3 failed"
    );
    println!("MinIO: 300MB file verified.");

    println!("All Large File & Dedup Tests Passed!");
}
