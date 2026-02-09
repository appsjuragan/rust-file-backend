use crate::services::storage::S3StorageService;
use aws_sdk_s3::config::Region;
use std::env;
use std::sync::Arc;
use tracing::info;

pub async fn setup_storage() -> Arc<S3StorageService> {
    // Setup S3 client
    let endpoint_url = env::var("MINIO_ENDPOINT").expect("MINIO_ENDPOINT must be set");
    let access_key = env::var("MINIO_ACCESS_KEY").expect("MINIO_ACCESS_KEY must be set");
    let secret_key = env::var("MINIO_SECRET_KEY").expect("MINIO_SECRET_KEY must be set");
    let bucket = env::var("MINIO_BUCKET").expect("MINIO_BUCKET must be set");

    info!("☁️  S3 Storage: {} (Bucket: {})", endpoint_url, bucket);

    let aws_config = aws_config::from_env()
        .endpoint_url(&endpoint_url)
        .region(Region::new("us-east-1"))
        .credentials_provider(aws_sdk_s3::config::Credentials::new(
            access_key, secret_key, None, None, "static",
        ))
        .load()
        .await;

    let s3_config = aws_sdk_s3::config::Builder::from(&aws_config)
        .force_path_style(true)
        .build();

    let s3_client = aws_sdk_s3::Client::from_conf(s3_config);

    // Ensure bucket exists
    match s3_client.head_bucket().bucket(&bucket).send().await {
        Ok(_) => info!("✅ Bucket '{}' is ready", bucket),
        Err(_) => {
            info!("🪣 Bucket '{}' not found, creating...", bucket);
            if let Err(e) = s3_client.create_bucket().bucket(&bucket).send().await {
                tracing::error!("❌ Failed to create bucket '{}': {}", bucket, e);
            } else {
                info!("✅ Bucket '{}' created successfully", bucket);
            }
        }
    }

    Arc::new(S3StorageService::new(s3_client, bucket))
}
