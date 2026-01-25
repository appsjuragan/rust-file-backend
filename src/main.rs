use sqlx::sqlite::SqlitePoolOptions;
use std::net::SocketAddr;
use std::sync::Arc;
use dotenvy::dotenv;
use std::env;
use rust_file_backend::services::storage::StorageService;
use rust_file_backend::services::expiration::expiration_worker;
use rust_file_backend::{create_app, AppState};
use aws_sdk_s3::config::Region;
use std::str::FromStr;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    tracing_subscriber::fmt::init();

    let db_url = env::var("DATABASE_URL")?;
    let pool = SqlitePoolOptions::new()
        .max_connections(100) // Increased for high concurrency
        .acquire_timeout(std::time::Duration::from_secs(30))
        .connect_with(
            sqlx::sqlite::SqliteConnectOptions::from_str(&db_url)?
                .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
                .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
                .busy_timeout(std::time::Duration::from_secs(30))
        )
        .await?;

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await?;

    // Setup S3 client
    let endpoint_url = env::var("MINIO_ENDPOINT")?;
    let access_key = env::var("MINIO_ACCESS_KEY")?;
    let secret_key = env::var("MINIO_SECRET_KEY")?;
    
    let config = aws_config::from_env()
        .endpoint_url(&endpoint_url)
        .region(Region::new("us-east-1"))
        .credentials_provider(aws_sdk_s3::config::Credentials::new(
            access_key,
            secret_key,
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
    let bucket = env::var("MINIO_BUCKET")?;
    let storage_service = Arc::new(StorageService::new(s3_client, bucket));

    let state = AppState {
        db: pool.clone(),
        storage: storage_service.clone(),
    };

    // Start expiration worker
    let worker_pool = pool.clone();
    let worker_storage = storage_service.clone();
    tokio::spawn(async move {
        expiration_worker(worker_pool, worker_storage).await;
    });

    let app = create_app(state)
        .layer(axum::extract::DefaultBodyLimit::disable());

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    tracing::info!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
