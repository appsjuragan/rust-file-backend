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
use rust_file_backend::services::storage_lifecycle::StorageLifecycleService;
use rust_file_backend::{AppState, create_app};
use sea_orm::{ActiveModelTrait, ConnectionTrait, Database, EntityTrait, PaginatorTrait, Set};
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

    // Apply schema updates for new features
    let schema_updates = vec![
        "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS parent_id VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS is_folder BOOLEAN DEFAULT FALSE",
        "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL",
    ];

    for query in schema_updates {
        db.execute(sea_orm::Statement::from_string(backend, query.to_owned()))
            .await
            .ok();
    }

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

/// Test Case 1: Single file deletion - ref_count = 1, verify S3 cleanup
#[tokio::test]
async fn test_single_file_deletion() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: Arc::new(NoOpScanner),
        config: SecurityConfig::development(),
    };

    let app = create_app(state);

    // 1. Register and Login
    app.clone()
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

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().unwrap();

    // 2. Upload File
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
                .body(Body::from(multipart_body))
                .unwrap(),
        )
        .await
        .unwrap();

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let file_id = json["file_id"].as_str().unwrap();

    // Verify file exists in DB and S3
    let storage_file = StorageFiles::find().one(&db).await.unwrap().unwrap();
    assert_eq!(storage_file.ref_count, 1);
    assert!(storage_service.file_exists(&storage_file.s3_key).await.unwrap());

    // 3. Delete File
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

    assert_eq!(response.status(), StatusCode::OK);

    // 4. Verify Deletion
    // User file should be soft-deleted (deleted_at set)
    let user_file = UserFiles::find_by_id(file_id).one(&db).await.unwrap().unwrap();
    assert!(user_file.deleted_at.is_some());

    // Storage file should be deleted from DB
    let storage_files_count = StorageFiles::find().count(&db).await.unwrap();
    assert_eq!(storage_files_count, 0);

    // File should be deleted from S3
    assert!(!storage_service.file_exists(&storage_file.s3_key).await.unwrap());
}

/// Test Case 2: Deduplicated file partial deletion - ref_count = 2 → 1, verify S3 NOT deleted
#[tokio::test]
async fn test_deduplicated_file_partial_deletion() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: Arc::new(NoOpScanner),
        config: SecurityConfig::development(),
    };

    let app = create_app(state);

    // 1. Register and Login
    app.clone()
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

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().unwrap();

    // 2. Upload File #1
    let boundary = "---------------------------123456789012345678901234567";
    let multipart_body = format!(
        "--{boundary}\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        Hello World\r\n\
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

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let file_id_1 = json["file_id"].as_str().unwrap().to_string();

    // 3. Upload File #2 (same content)
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

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let file_id_2 = json["file_id"].as_str().unwrap().to_string();

    // Verify deduplication
    let storage_file = StorageFiles::find().one(&db).await.unwrap().unwrap();
    assert_eq!(storage_file.ref_count, 2);

    // 4. Delete First File
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(&format!("/files/{}", file_id_1))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // 5. Verify Partial Deletion
    // First user file should be soft-deleted
    let user_file_1 = UserFiles::find_by_id(&file_id_1).one(&db).await.unwrap().unwrap();
    assert!(user_file_1.deleted_at.is_some());

    // Second user file should still exist and not be deleted
    let user_file_2 = UserFiles::find_by_id(&file_id_2).one(&db).await.unwrap().unwrap();
    assert!(user_file_2.deleted_at.is_none());

    // Storage file should still exist with ref_count = 1
    let storage_file = StorageFiles::find().one(&db).await.unwrap().unwrap();
    assert_eq!(storage_file.ref_count, 1);

    // File should STILL exist in S3
    assert!(storage_service.file_exists(&storage_file.s3_key).await.unwrap());
}

/// Test Case 3: Deduplicated file final deletion - ref_count = 1 → 0, verify S3 cleanup
#[tokio::test]
async fn test_deduplicated_file_final_deletion() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: Arc::new(NoOpScanner),
        config: SecurityConfig::development(),
    };

    let app = create_app(state);

    // 1. Register and Login
    app.clone()
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

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().unwrap();

    // 2. Upload File #1
    let boundary = "---------------------------123456789012345678901234567";
    let multipart_body = format!(
        "--{boundary}\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        Hello World\r\n\
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

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let file_id_1 = json["file_id"].as_str().unwrap().to_string();

    // 3. Upload File #2 (same content)
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

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let file_id_2 = json["file_id"].as_str().unwrap().to_string();

    // Verify deduplication
    let storage_file = StorageFiles::find().one(&db).await.unwrap().unwrap();
    let s3_key = storage_file.s3_key.clone();
    assert_eq!(storage_file.ref_count, 2);

    // 4. Delete First File
    app.clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(&format!("/files/{}", file_id_1))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Verify ref_count = 1
    let storage_file = StorageFiles::find().one(&db).await.unwrap().unwrap();
    assert_eq!(storage_file.ref_count, 1);

    // 5. Delete Second File
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(&format!("/files/{}", file_id_2))
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // 6. Verify Final Deletion
    // Both user files should be soft-deleted
    let user_file_1 = UserFiles::find_by_id(&file_id_1).one(&db).await.unwrap().unwrap();
    assert!(user_file_1.deleted_at.is_some());

    let user_file_2 = UserFiles::find_by_id(&file_id_2).one(&db).await.unwrap().unwrap();
    assert!(user_file_2.deleted_at.is_some());

    // Storage file should be deleted from DB
    let storage_files_count = StorageFiles::find().count(&db).await.unwrap();
    assert_eq!(storage_files_count, 0);

    // File should be deleted from S3
    assert!(!storage_service.file_exists(&s3_key).await.unwrap());
}

/// Test Case 4: Folder deletion with files - verify recursive deletion and ref counting
#[tokio::test]
async fn test_folder_deletion_with_files() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;

    // Insert a user directly
    let user_id = "user_1";
    let user = users::ActiveModel {
        id: Set(user_id.to_string()),
        username: Set("testuser".to_string()),
        password_hash: Set("hash".to_string()),
        ..Default::default()
    };
    user.insert(&db).await.unwrap();

    // Create a folder
    let folder_id = "folder_1";
    let folder = user_files::ActiveModel {
        id: Set(folder_id.to_string()),
        user_id: Set(user_id.to_string()),
        storage_file_id: Set(None),
        filename: Set("test_folder".to_string()),
        is_folder: Set(true),
        parent_id: Set(None),
        ..Default::default()
    };
    folder.insert(&db).await.unwrap();

    // Create a storage file
    let storage_id = "storage_1";
    let s3_key = "test/file.txt";
    storage_service.upload_file(s3_key, b"test content".to_vec()).await.unwrap();

    let storage_file = storage_files::ActiveModel {
        id: Set(storage_id.to_string()),
        hash: Set("test_hash".to_string()),
        s3_key: Set(s3_key.to_string()),
        size: Set(12),
        ref_count: Set(1),
        ..Default::default()
    };
    storage_file.insert(&db).await.unwrap();

    // Create a file inside the folder
    let file_id = "file_1";
    let file = user_files::ActiveModel {
        id: Set(file_id.to_string()),
        user_id: Set(user_id.to_string()),
        storage_file_id: Set(Some(storage_id.to_string())),
        filename: Set("test.txt".to_string()),
        is_folder: Set(false),
        parent_id: Set(Some(folder_id.to_string())),
        ..Default::default()
    };
    file.insert(&db).await.unwrap();

    // Delete folder recursively
    StorageLifecycleService::delete_folder_recursive(&db, &storage_service, folder_id)
        .await
        .unwrap();

    // Soft delete the folder itself
    let folder_model = UserFiles::find_by_id(folder_id).one(&db).await.unwrap().unwrap();
    StorageLifecycleService::soft_delete_user_file(&db, &storage_service, &folder_model)
        .await
        .unwrap();

    // Verify both folder and file are soft-deleted
    let folder = UserFiles::find_by_id(folder_id).one(&db).await.unwrap().unwrap();
    assert!(folder.deleted_at.is_some());

    let file = UserFiles::find_by_id(file_id).one(&db).await.unwrap().unwrap();
    assert!(file.deleted_at.is_some());

    // Verify storage file is deleted
    let storage_files_count = StorageFiles::find().count(&db).await.unwrap();
    assert_eq!(storage_files_count, 0);

    // Verify S3 file is deleted
    assert!(!storage_service.file_exists(s3_key).await.unwrap());
}

/// Test Case 5: Bulk delete endpoint
#[tokio::test]
async fn test_bulk_delete() {
    let db = setup_test_db().await;
    let storage_service = setup_s3().await;

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: Arc::new(NoOpScanner),
        config: SecurityConfig::development(),
    };

    let app = create_app(state);

    // 1. Register and Login
    app.clone()
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

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let token = json["token"].as_str().unwrap();

    // 2. Upload 3 files
    let boundary = "---------------------------123456789012345678901234567";
    let mut file_ids = Vec::new();

    for i in 1..=3 {
        let multipart_body = format!(
            "--{boundary}\r\n\
            Content-Disposition: form-data; name=\"file\"; filename=\"test{}.txt\"\r\n\
            Content-Type: text/plain\r\n\r\n\
            Content {}\r\n\
            --{boundary}--\r\n",
            i, i, boundary = boundary
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

        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: Value = serde_json::from_slice(&body).unwrap();
        file_ids.push(json["file_id"].as_str().unwrap().to_string());
    }

    // 3. Bulk Delete
    let bulk_delete_body = serde_json::json!({
        "item_ids": file_ids
    });

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/files/bulk-delete")
                .header("Authorization", format!("Bearer {}", token))
                .header("Content-Type", "application/json")
                .body(Body::from(bulk_delete_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["deleted_count"], 3);

    // 4. Verify all files are soft-deleted
    for file_id in &file_ids {
        let user_file = UserFiles::find_by_id(file_id).one(&db).await.unwrap().unwrap();
        assert!(user_file.deleted_at.is_some());
    }

    // Verify storage files are deleted
    let storage_files_count = StorageFiles::find().count(&db).await.unwrap();
    assert_eq!(storage_files_count, 0);
}
