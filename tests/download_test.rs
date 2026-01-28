use aws_sdk_s3::config::{Credentials, Region};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use rust_file_backend::config::SecurityConfig;
use rust_file_backend::entities::prelude::*;
use rust_file_backend::services::scanner::NoOpScanner;
use rust_file_backend::services::storage::StorageService;
use rust_file_backend::{AppState, create_app};
use sea_orm::{ConnectionTrait, Database};
use serde_json::Value;
use std::sync::Arc;
use tower::ServiceExt;

async fn setup_test_db() -> sea_orm::DatabaseConnection {
    let db = Database::connect("sqlite::memory:").await.unwrap();

    let backend = db.get_database_backend();
    let schema = sea_orm::Schema::new(backend);

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
async fn test_download_flow() {
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
    let content = "Hello, this is a test file content for download!";
    let multipart_body = format!(
        "--{boundary}\r\n\
        Content-Disposition: form-data; name=\"file\"; filename=\"test_download.txt\"\r\n\
        Content-Type: text/plain\r\n\r\n\
        {content}\r\n\
        --{boundary}--\r\n",
        boundary = boundary,
        content = content
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

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let file_id = json["file_id"].as_str().unwrap();

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
    assert_eq!(
        response.headers()["content-type"],
        "application/octet-stream"
    );
    assert!(
        response.headers()["content-disposition"]
            .to_str()
            .unwrap()
            .contains("test_download.txt")
    );

    let downloaded_content = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(String::from_utf8_lossy(&downloaded_content), content);

    // 5. Unauthorized Download
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/files/{}", file_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    // 6. Non-existent File Download
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/files/non-existent-id")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
