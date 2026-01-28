use aws_sdk_s3::config::{Credentials, Region};
use dotenvy::dotenv;
use rust_file_backend::services::storage::{StorageService, S3StorageService};

use sqlx::sqlite::SqlitePoolOptions;
use std::env;

#[derive(sqlx::FromRow)]
struct UserRow {
    id: String,
    username: String,
}

#[derive(sqlx::FromRow)]
struct FileRow {
    user_file_id: String,
    filename: String,
    s3_key: String,
    size: i64,
    hash: String,
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    println!("--- Verifying Persistence ---");

    // 1. Connect to DB
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    println!("Connecting to DB: {}", db_url);
    let pool = SqlitePoolOptions::new()
        .connect(&db_url)
        .await
        .expect("Failed to connect to DB");

    // 2. Setup S3
    let endpoint =
        env::var("MINIO_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".to_string());
    let access_key = env::var("MINIO_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".to_string());
    let secret_key = env::var("MINIO_SECRET_KEY").unwrap_or_else(|_| "minioadmin".to_string());
    let bucket = env::var("MINIO_BUCKET").unwrap_or_else(|_| "uploads".to_string());
    let region = env::var("MINIO_REGION").unwrap_or_else(|_| "us-east-1".to_string());

    let config = aws_config::from_env()
        .endpoint_url(&endpoint)
        .region(Region::new(region))
        .credentials_provider(Credentials::new(
            access_key, secret_key, None, None, "static",
        ))
        .load()
        .await;

    let s3_config = aws_sdk_s3::config::Builder::from(&config)
        .force_path_style(true)
        .build();

    let s3_client = aws_sdk_s3::Client::from_conf(s3_config);
    let storage_service = S3StorageService::new(s3_client, bucket);

    // 3. Check User
    let user: Option<UserRow> = sqlx::query_as("SELECT id, username FROM users WHERE username = 'curluser'")
        .fetch_optional(&pool)
        .await
        .unwrap();

    if let Some(u) = user {
        println!("User Found: {} ({})", u.username, u.id);

        // 4. Check Files
        let files: Vec<FileRow> = sqlx::query_as(
            "SELECT uf.id as user_file_id, uf.filename, sf.s3_key, sf.size, sf.hash 
             FROM user_files uf
             JOIN storage_files sf ON uf.storage_file_id = sf.id
             WHERE uf.user_id = $1"
        )
        .bind(&u.id)
        .fetch_all(&pool)
        .await
        .unwrap();

        println!("Found {} files for user.", files.len());

        if files.is_empty() {
            println!("WARNING: No files found for user!");
        }

        for file in files {
            println!("  File: {} (ID: {})", file.filename, file.user_file_id);
            println!("    S3 Key: {}", file.s3_key);
            println!("    Hash: {}", file.hash);
            println!("    Size: {}", file.size);

            // 5. Verify S3 Existence
            let exists = storage_service.file_exists(&file.s3_key).await;
            match exists {
                Ok(true) => println!("    [PASS] File exists in MinIO!"),
                Ok(false) => println!("    [FAIL] File MISSING in MinIO!"),
                Err(e) => println!("    [ERROR] Failed to check MinIO: {}", e),
            }
        }
    } else {
        println!("User 'curluser' NOT FOUND in DB!");
    }
}
