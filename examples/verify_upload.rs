use aws_sdk_s3::config::{Credentials, Region};
use dotenvy::dotenv;
use rust_file_backend::services::storage::StorageService;
use sqlx::sqlite::SqlitePoolOptions;
use std::env;
use std::sync::Arc;

#[tokio::main]
async fn main() {
    dotenv().ok();
    println!("--- Verifying Persistence ---");

    // 1. Connect to DB
    let db_url = "sqlite:backend.db"; // Hardcoded to match .env or what we used
    println!("Connecting to DB: {}", db_url);
    let pool = SqlitePoolOptions::new()
        .connect(db_url)
        .await
        .expect("Failed to connect to DB");

    // 2. Setup S3
    let endpoint = "http://localhost:9000";
    let config = aws_config::from_env()
        .endpoint_url(endpoint)
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
    let storage_service = StorageService::new(s3_client, "uploads".to_string());

    // 3. Check User
    let user = sqlx::query!("SELECT id, username FROM users WHERE username = 'manualtest'")
        .fetch_optional(&pool)
        .await
        .unwrap();

    if let Some(u) = user {
        println!("User Found: {} ({})", u.username, u.id);

        // 4. Check Files
        let files = sqlx::query!(
            "SELECT uf.id as user_file_id, uf.filename, sf.s3_key, sf.size, sf.hash 
             FROM user_files uf
             JOIN storage_files sf ON uf.storage_file_id = sf.id
             WHERE uf.user_id = ?",
            u.id
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        println!("Found {} files for user.", files.len());

        for file in files {
            println!("  File: {} (ID: {})", file.filename, file.user_file_id);
            println!("    S3 Key: {}", file.s3_key);
            println!("    Hash: {}", file.hash);
            println!("    Size: {}", file.size);

            // 5. Verify S3 Existence
            let exists = storage_service.file_exists(&file.s3_key).await.unwrap();
            match exists {
                true => println!("    [PASS] File exists in MinIO!"),
                false => println!("    [FAIL] File MISSING in MinIO!"),
            }
        }
    } else {
        println!("User 'manualtest' NOT FOUND in DB!");
    }
}
