use aws_sdk_s3::config::Region;
use dotenvy::dotenv;
use rust_file_backend::services::expiration::expiration_worker;
use rust_file_backend::services::storage::StorageService;
use rust_file_backend::{AppState, create_app};
use sqlx::sqlite::SqlitePoolOptions;
use std::env;
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;
use tokio::signal;
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();

    // Initialize tracing with EnvFilter
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rust_file_backend=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("🚀 Starting Rust File Backend...");

    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    info!("📂 Database: {}", db_url);

    let pool = SqlitePoolOptions::new()
        .max_connections(100)
        .acquire_timeout(std::time::Duration::from_secs(30))
        .connect_with(
            sqlx::sqlite::SqliteConnectOptions::from_str(&db_url)?
                .create_if_missing(true)
                .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
                .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
                .busy_timeout(std::time::Duration::from_secs(30)),
        )
        .await?;

    info!("⚙️  Running database migrations...");
    sqlx::migrate!("./migrations").run(&pool).await?;

    // Setup S3 client
    let endpoint_url = env::var("MINIO_ENDPOINT").expect("MINIO_ENDPOINT must be set");
    let access_key = env::var("MINIO_ACCESS_KEY").expect("MINIO_ACCESS_KEY must be set");
    let secret_key = env::var("MINIO_SECRET_KEY").expect("MINIO_SECRET_KEY must be set");
    let bucket = env::var("MINIO_BUCKET").expect("MINIO_BUCKET must be set");

    info!("☁️  S3 Storage: {} (Bucket: {})", endpoint_url, bucket);

    let config = aws_config::from_env()
        .endpoint_url(&endpoint_url)
        .region(Region::new("us-east-1"))
        .credentials_provider(aws_sdk_s3::config::Credentials::new(
            access_key, secret_key, None, None, "static",
        ))
        .load()
        .await;

    let s3_config = aws_sdk_s3::config::Builder::from(&config)
        .force_path_style(true)
        .build();

    // Load security config
    let config = rust_file_backend::config::SecurityConfig::from_env();
    info!(
        "🛡️  Security Config: Max Size={}MB, Virus Scan={}, Scanner={}",
        config.max_file_size / 1024 / 1024,
        config.enable_virus_scan,
        config.virus_scanner_type
    );

    let s3_client = aws_sdk_s3::Client::from_conf(s3_config);
    let storage_service = Arc::new(StorageService::new(s3_client, bucket));
    let scanner_service =
        rust_file_backend::services::scanner::create_scanner(&config.virus_scanner_type);

    // Warm up scanner connection
    if config.enable_virus_scan {
        if scanner_service.health_check().await {
            info!("🦠 Virus scanner connected successfully");
        } else {
            tracing::warn!(
                "⚠️  Virus scanner unreachable! Uploads may be rejected or skipped depending on policy."
            );
        }
    }

    let state = AppState {
        db: pool.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service.into(),
        config: config.clone(),
    };

    // Start expiration worker
    let worker_pool = pool.clone();
    let worker_storage = storage_service.clone();
    tokio::spawn(async move {
        expiration_worker(worker_pool, worker_storage).await;
    });

    // Rate limiting configuration
    // Note: In a real distributed setup, you'd use a Redis-backed rate limiter.
    // For single instance, in-memory governor is fine.
    // let governor_conf = Box::new(
    //     tower_governor::governor::GovernorConfigBuilder::default()
    //         .period(std::time::Duration::from_secs(3600) / (config.uploads_per_hour.max(1)))
    //         .burst_size(5)
    //         .finish()
    //         .unwrap(),
    // );

    let app = create_app(state)
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &axum::http::Request<_>| {
                    tracing::info_span!(
                        "http_request",
                        method = %request.method(),
                        uri = %request.uri(),
                    )
                })
                .on_request(|request: &axum::http::Request<_>, _span: &tracing::Span| {
                    info!("📥 {} {}", request.method(), request.uri());
                })
                .on_response(
                    |response: &axum::http::Response<_>,
                     latency: std::time::Duration,
                     _span: &tracing::Span| {
                        info!(
                            "📤 Finished in {:?} with status {}",
                            latency,
                            response.status()
                        );
                    },
                ),
        )
        // Global rate limiting (IP-based by default with GovernorLayer)
        // .layer(tower_governor::GovernorLayer::new(governor_conf))
        .layer(axum::extract::DefaultBodyLimit::max(config.max_file_size));

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    info!("✅ Server ready at http://{}", addr);
    info!("📖 Swagger UI: http://{}/swagger-ui", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("🛑 Server shut down gracefully.");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("⌨️  Ctrl+C received, starting graceful shutdown...");
        },
        _ = terminate => {
            info!("💤 SIGTERM received, starting graceful shutdown...");
        },
    }
}
