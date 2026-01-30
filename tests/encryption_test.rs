use aws_sdk_s3::config::{Credentials, Region};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use rust_file_backend::config::SecurityConfig;
use rust_file_backend::entities::{prelude::*, *};
use rust_file_backend::services::file_service::FileService;
use rust_file_backend::services::scanner::NoOpScanner;
use rust_file_backend::services::storage::{S3StorageService, StorageService};
use rust_file_backend::{AppState, create_app};
use sea_orm::{ColumnTrait, ConnectionTrait, Database, EntityTrait};
use serde_json::Value;
use std::sync::Arc;
use tower::ServiceExt;

async fn setup_test_db() -> sea_orm::DatabaseConnection {
    let db = Database::connect("sqlite::memory:").await.unwrap();

    let backend = db.get_database_backend();
    let schema = sea_orm::Schema::new(backend);

    // Create tables
    db.execute(backend.build(&schema.create_table_from_entity(Users)))
        .await
        .ok();
    db.execute(backend.build(&schema.create_table_from_entity(Tokens)))
        .await
        .ok();
    db.execute(backend.build(&schema.create_table_from_entity(StorageFiles)))
        .await
        .ok();
    db.execute(backend.build(&schema.create_table_from_entity(UserFiles)))
        .await
        .ok();
    db.execute(backend.build(&schema.create_table_from_entity(FileMetadata)))
        .await
        .ok();
    db.execute(backend.build(&schema.create_table_from_entity(Tags)))
        .await
        .ok();
    db.execute(backend.build(&schema.create_table_from_entity(FileTags)))
        .await
        .ok();
    db.execute(backend.build(&schema.create_table_from_entity(AuditLogs)))
        .await
        .ok();

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
    // Create bucket if not exists
    let _ = s3_client
        .create_bucket()
        .bucket("encryption-test-bucket")
        .send()
        .await;
    Arc::new(S3StorageService::new(
        s3_client,
        "encryption-test-bucket".to_string(),
    ))
}

#[tokio::test]
async fn test_encryption_flow() {
    unsafe {
        std::env::set_var("SYSTEM_SECRET", "test_system_secret_very_secure_123");
    }
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;

    // ... (rest of setup) ...

    let scanner_service = Arc::new(NoOpScanner);
    let config = SecurityConfig::development();

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

    // 1. Register (Should generate keys)
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/register")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"username": "enc_user", "password": "password"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    // Verify Keys in DB
    let user = Users::find()
        .filter(users::Column::Username.eq("enc_user"))
        .one(&db)
        .await
        .unwrap()
        .unwrap();
    assert!(user.public_key.is_some(), "Public key should be generated");
    assert!(
        user.private_key_enc.is_some(),
        "Encrypted private key should be generated"
    );

    // 2. Login
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/login")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"username": "enc_user", "password": "password"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().unwrap();

    // 3. Upload File
    let boundary = "boundary123";
    let content = "Secret Content 123";
    let multipart_body = format!(
        "--{boundary}\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"secret.txt\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        {}\r\n\
        --{boundary}--\r\n",
        content,
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
        let error_msg = String::from_utf8_lossy(&body);
        panic!("Upload failed: Status {}, Body: {}", status, error_msg);
    }
    let json: Value = serde_json::from_slice(&body).unwrap();
    let file_id = json["file_id"].as_str().unwrap();

    // Verify DB State
    let user_file = UserFiles::find_by_id(file_id)
        .one(&db)
        .await
        .unwrap()
        .unwrap();
    assert!(
        user_file.encryption_key.is_some(),
        "File encryption key should be present in DB"
    );

    let storage_file = StorageFiles::find_by_id(user_file.storage_file_id.unwrap())
        .one(&db)
        .await
        .unwrap()
        .unwrap();
    // Content is 18 bytes. Encrypted should be > 18.
    // 1 chunk. Size + 12 (Nonce) + 16 (Tag) = 18 + 28 = 46.
    // Verify S3 Object Content (Raw)
    let s3_res = storage_service
        .get_object_stream(&storage_file.s3_key)
        .await
        .expect("Failed to get raw S3 object");
    let raw_body = s3_res.body.collect().await.unwrap().into_bytes();

    println!("Plaintext: '{}', size: {}", content, content.len());
    println!("Raw S3 size: {}", raw_body.len());

    // Check that plaintext is not found in raw storage
    assert!(
        !raw_body
            .windows(content.len())
            .any(|w| w == content.as_bytes()),
        "Raw storage must NOT contain plaintext!"
    );

    // Check size overhead (12 bytes nonce + 16 bytes tag = 28 bytes per chunk)
    assert!(
        raw_body.len() >= content.len() + 28,
        "S3 object should have encryption overhead"
    );

    // Verify S3 Object Size (Accessing storage service directly)
    let s3_obj = storage_service
        .get_object_stream(&storage_file.s3_key)
        .await
        .unwrap();
    assert!(
        s3_obj.content_length.unwrap() > 18,
        "S3 object should be encrypted (larger)"
    );

    // 4. Download File
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/files/{}", file_id))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(
        body,
        content.as_bytes(),
        "Decrypted content must match original"
    );

    // 5. Audit Log Check
    let logs = AuditLogs::find().all(&db).await.unwrap();
    assert!(!logs.is_empty());
    // Should have Register, Upload, Decrypt events
    let events: Vec<String> = logs.iter().map(|l| l.event_type.clone()).collect();
    assert!(events.contains(&"UserRegister".to_string()));
    assert!(events.contains(&"FileUpload".to_string()));
    assert!(events.contains(&"FileDecrypt".to_string()));
}
