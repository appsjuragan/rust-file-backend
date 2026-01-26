use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use rust_file_backend::{create_app, AppState};
use rust_file_backend::services::storage::StorageService;
use rust_file_backend::config::SecurityConfig;
use rust_file_backend::services::scanner::NoOpScanner;
use sqlx::sqlite::SqlitePoolOptions;
use std::sync::Arc;
use tower::ServiceExt;
use serde_json::Value;
use http_body_util::BodyExt;
use aws_sdk_s3::config::{Region, Credentials};
use chrono::{Utc, Duration};

#[tokio::test]
async fn test_upload_flow() {
    // Setup in-memory DB
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .unwrap();

    // Setup S3 client
    let config = aws_config::from_env()
        .endpoint_url("http://127.0.0.1:9000")
        .region(Region::new("us-east-1"))
        .credentials_provider(Credentials::new("minioadmin", "minioadmin", None, None, "static"))
        .load()
        .await;
    
    let s3_config = aws_sdk_s3::config::Builder::from(&config)
        .force_path_style(true)
        .build();
    
    let s3_client = aws_sdk_s3::Client::from_conf(s3_config);
    let storage_service = Arc::new(StorageService::new(s3_client, "uploads".to_string()));

    let state = AppState {
        db: pool.clone(),
        storage: storage_service.clone(),
        scanner: Arc::new(NoOpScanner),
        config: SecurityConfig::development(),
    };

    let app = create_app(state);

    // 1. Register
    let response = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/register")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"username": "testuser", "password": "password123"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    // 2. Login
    let response = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/login")
                .header("Content-Type", "application/json")
                .body(Body::from(r#"{"username": "testuser", "password": "password123"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().unwrap();

    // 3. Upload File
    let boundary = "---------------------------123456789012345678901234567";
    let multipart_body = format!(
        "--{boundary}\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        Hello, this is a test file content!\r\n\
        --{boundary}--\r\n",
        boundary = boundary
    );

    let response = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/upload")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", format!("multipart/form-data; boundary={}", boundary))
                .body(Body::from(multipart_body.clone()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    if status != StatusCode::OK {
        panic!("Upload failed with status {}: {:?}", status, String::from_utf8_lossy(&body));
    }
    
    let json: Value = serde_json::from_slice(&body).unwrap();
    let file_id = json["file_id"].as_str().unwrap();
    assert!(!file_id.is_empty());

    // 4. Upload Same File (Deduplication Check)
    let response = app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/upload")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", format!("multipart/form-data; boundary={}", boundary))
                .body(Body::from(multipart_body))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(status, StatusCode::OK);
    
    let json: Value = serde_json::from_slice(&body).unwrap();
    let second_file_id = json["file_id"].as_str().unwrap();
    
    assert_ne!(file_id, second_file_id);

    // Verify in DB that both user_files point to the same storage_file
    let storage_files_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM storage_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(storage_files_count, 1);

    let ref_count: i32 = sqlx::query_scalar("SELECT ref_count FROM storage_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(ref_count, 2);

    // Verify file exists in S3
    let s3_key: String = sqlx::query_scalar("SELECT s3_key FROM storage_files")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(storage_service.file_exists(&s3_key).await.unwrap());
}

#[tokio::test]
async fn test_expiration_logic() {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .unwrap();

    let config = aws_config::from_env()
        .endpoint_url("http://127.0.0.1:9000")
        .region(Region::new("us-east-1"))
        .credentials_provider(Credentials::new("minioadmin", "minioadmin", None, None, "static"))
        .load()
        .await;
    
    let s3_config = aws_sdk_s3::config::Builder::from(&config)
        .force_path_style(true)
        .build();
    
    let s3_client = aws_sdk_s3::Client::from_conf(s3_config);
    let storage_service = Arc::new(StorageService::new(s3_client, "uploads".to_string()));

    // 0. Insert a user
    let user_id = "user_1";
    sqlx::query("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
        .bind(user_id)
        .bind("testuser")
        .bind("hash")
        .execute(&pool)
        .await
        .unwrap();

    // 1. Insert a file that is already expired
    let storage_id = "storage_1";
    let user_file_id = "user_file_1";
    let hash = "fake_hash";
    let s3_key = "expired/test.txt";

    // Upload a dummy file to S3 so the worker can delete it
    storage_service.upload_file(s3_key, b"expired content".to_vec()).await.unwrap();

    sqlx::query("INSERT INTO storage_files (id, hash, s3_key, size, ref_count) VALUES (?, ?, ?, ?, ?)")
        .bind(storage_id)
        .bind(hash)
        .bind(s3_key)
        .bind(15)
        .bind(1)
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query("INSERT INTO user_files (id, user_id, storage_file_id, filename, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(user_file_id)
        .bind(user_id)
        .bind(storage_id)
        .bind("test.txt")
        .bind(Utc::now() - Duration::hours(1))
        .execute(&pool)
        .await
        .unwrap();

    // 2. Run the worker logic manually
    let expired_files = sqlx::query_as::<_, rust_file_backend::models::UserFile>(
        "SELECT id, user_id, storage_file_id, filename, expires_at, created_at FROM user_files WHERE expires_at < ?"
    )
    .bind(Utc::now())
    .fetch_all(&pool)
    .await
    .unwrap();

    assert_eq!(expired_files.len(), 1);

    for file in expired_files {
        let mut tx = pool.begin().await.unwrap();
        sqlx::query("DELETE FROM user_files WHERE id = ?").bind(&file.id).execute(&mut *tx).await.unwrap();
        
        let sf: rust_file_backend::models::StorageFile = sqlx::query_as(
            "UPDATE storage_files SET ref_count = ref_count - 1 WHERE id = ? RETURNING id, hash, s3_key, size, ref_count, scan_status, scan_result, scanned_at, mime_type, content_type"
        )
        .bind(&file.storage_file_id)
        .fetch_one(&mut *tx)
        .await
        .unwrap();

        if sf.ref_count <= 0 {
            storage_service.delete_file(&sf.s3_key).await.unwrap();
            sqlx::query("DELETE FROM storage_files WHERE id = ?").bind(&file.storage_file_id).execute(&mut *tx).await.unwrap();
        }
        tx.commit().await.unwrap();
    }

    // 3. Verify cleanup
    let user_files_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_files").fetch_one(&pool).await.unwrap();
    assert_eq!(user_files_count, 0);

    let storage_files_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM storage_files").fetch_one(&pool).await.unwrap();
    assert_eq!(storage_files_count, 0);

    // Verify file is deleted from S3
    assert!(!storage_service.file_exists(s3_key).await.unwrap());
}
