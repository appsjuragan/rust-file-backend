use aws_sdk_s3::config::{Credentials, Region};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use rust_file_backend::config::SecurityConfig;
use rust_file_backend::entities::{prelude::*, *};
use rust_file_backend::services::scanner::NoOpScanner;
use rust_file_backend::services::storage::StorageService;
use rust_file_backend::{AppState, create_app};
use sea_orm::{ColumnTrait, ConnectionTrait, Database, EntityTrait, PaginatorTrait, QueryFilter};
use serde_json::Value;
use std::sync::Arc;
use tower::ServiceExt;

async fn setup_test_db() -> sea_orm::DatabaseConnection {
    let db = Database::connect("sqlite::memory:").await.unwrap();

    // Run migrations using raw SQL since we're in test mode
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

    db
}

async fn setup_s3() -> Arc<StorageService> {
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
    Arc::new(StorageService::new(s3_client, "uploads".to_string()))
}

#[tokio::test]
async fn test_upload_flow() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: Arc::new(NoOpScanner),
        config: SecurityConfig::development(),
    };

    let app = create_app(state);

    // 1. Register
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/register")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"username": "testuser", "password": "password123"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CREATED);

    // 2. Login
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/login")
                .header("Content-Type", "application/json")
                .body(Body::from(
                    r#"{"username": "testuser", "password": "password123"}"#,
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
    let boundary = "---------------------------123456789012345678901234567";
    let multipart_body = format!(
        "--{boundary}\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        Hello, this is a test file content!\r\n\
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
                .body(Body::from(multipart_body.clone()))
                .unwrap(),
        )
        .await
        .unwrap();

    let status = response.status();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    if status != StatusCode::OK {
        panic!(
            "Upload failed with status {}: {:?}",
            status,
            String::from_utf8_lossy(&body)
        );
    }

    let json: Value = serde_json::from_slice(&body).unwrap();
    let file_id = json["file_id"].as_str().unwrap();
    assert!(!file_id.is_empty());

    // 4. Upload Same File (Deduplication Check)
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
    assert_eq!(status, StatusCode::OK);

    let json: Value = serde_json::from_slice(&body).unwrap();
    let second_file_id = json["file_id"].as_str().unwrap();

    // Different user_file IDs but same storage file
    assert_ne!(file_id, second_file_id);

    // Verify in DB that both user_files point to the same storage_file
    let storage_files_count = StorageFiles::find().count(&db).await.unwrap();
    assert_eq!(storage_files_count, 1);

    let storage_file = StorageFiles::find().one(&db).await.unwrap().unwrap();
    assert_eq!(storage_file.ref_count, 2);

    // Verify file exists in S3
    assert!(
        storage_service
            .file_exists(&storage_file.s3_key)
            .await
            .unwrap()
    );
}

#[tokio::test]
async fn test_expiration_logic() {
    use chrono::{Duration, Utc};
    use sea_orm::{ActiveModelTrait, Set};

    let db = setup_test_db().await;
    let storage_service = setup_s3().await;

    // 0. Insert a user
    let user_id = "user_1";
    let user = users::ActiveModel {
        id: Set(user_id.to_string()),
        username: Set("testuser".to_string()),
        password_hash: Set("hash".to_string()),
        ..Default::default()
    };
    user.insert(&db).await.unwrap();

    // 1. Insert a file that is already expired
    let storage_id = "storage_1";
    let user_file_id = "user_file_1";
    let hash = "fake_hash";
    let s3_key = "expired/test.txt";

    // Upload a dummy file to S3 so the worker can delete it
    storage_service
        .upload_file(s3_key, b"expired content".to_vec())
        .await
        .unwrap();

    let storage_file = storage_files::ActiveModel {
        id: Set(storage_id.to_string()),
        hash: Set(hash.to_string()),
        s3_key: Set(s3_key.to_string()),
        size: Set(15),
        ref_count: Set(1),
        ..Default::default()
    };
    storage_file.insert(&db).await.unwrap();

    let user_file = user_files::ActiveModel {
        id: Set(user_file_id.to_string()),
        user_id: Set(user_id.to_string()),
        storage_file_id: Set(Some(storage_id.to_string())),
        filename: Set("test.txt".to_string()),
        expires_at: Set(Some(Utc::now() - Duration::hours(1))),
        ..Default::default()
    };
    user_file.insert(&db).await.unwrap();

    // 2. Query expired files
    let expired_files = UserFiles::find()
        .filter(user_files::Column::ExpiresAt.lt(Utc::now()))
        .all(&db)
        .await
        .unwrap();

    assert_eq!(expired_files.len(), 1);

    // 3. Simulate worker cleanup
    for file in expired_files {
        use sea_orm::ModelTrait;

        // Delete user file
        file.clone().delete(&db).await.unwrap();

        // Get and update storage file
        if let Some(storage_id) = file.storage_file_id.clone() {
            if let Some(sf) = StorageFiles::find_by_id(storage_id)
                .one(&db)
                .await
                .unwrap()
            {
                let new_count = sf.ref_count - 1;
                let mut active_sf: storage_files::ActiveModel = sf.clone().into();
                active_sf.ref_count = Set(new_count);
                let updated_sf = active_sf.update(&db).await.unwrap();

                if updated_sf.ref_count <= 0 {
                    storage_service
                        .delete_file(&updated_sf.s3_key)
                        .await
                        .unwrap();
                    updated_sf.delete(&db).await.unwrap();
                }
            }
        }
    }

    // 4. Verify cleanup
    let user_files_count = UserFiles::find().count(&db).await.unwrap();
    assert_eq!(user_files_count, 0);

    let storage_files_count = StorageFiles::find().count(&db).await.unwrap();
    assert_eq!(storage_files_count, 0);

    // Verify file is deleted from S3
    assert!(!storage_service.file_exists(s3_key).await.unwrap());
}
