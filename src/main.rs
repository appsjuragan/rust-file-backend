use aws_sdk_s3::config::Region;
use dotenvy::dotenv;
use rust_file_backend::services::expiration::expiration_worker;
use rust_file_backend::services::storage::StorageService;
use rust_file_backend::{AppState, create_app};
use std::env;
use std::net::SocketAddr;
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

    let mut opt = sea_orm::ConnectOptions::new(&db_url);
    opt.max_connections(100)
        .min_connections(5)
        .connect_timeout(std::time::Duration::from_secs(30))
        .acquire_timeout(std::time::Duration::from_secs(30))
        .idle_timeout(std::time::Duration::from_secs(600))
        .max_lifetime(std::time::Duration::from_secs(1800))
        .sqlx_logging(true)
        .sqlx_logging_level(log::LevelFilter::Debug);

    let db = sea_orm::Database::connect(opt).await?;

    info!("✅ Database connected successfully");

    // Auto-migration
    {
        use rust_file_backend::entities::{file_metadata, file_tags, storage_files, tags, tokens, user_files, users};
        use sea_orm::{ConnectionTrait, Schema};

        let builder = db.get_database_backend();
        let schema = Schema::new(builder);

        info!("🔄 Running auto-migrations...");

        // Order matters for foreign keys: Users -> Tokens, StorageFiles -> UserFiles
        let stmts = vec![
            (
                "users",
                schema
                    .create_table_from_entity(users::Entity)
                    .if_not_exists()
                    .to_owned(),
            ),
            (
                "tokens",
                schema
                    .create_table_from_entity(tokens::Entity)
                    .if_not_exists()
                    .to_owned(),
            ),
            (
                "storage_files",
                schema
                    .create_table_from_entity(storage_files::Entity)
                    .if_not_exists()
                    .to_owned(),
            ),
            (
                "user_files",
                schema
                    .create_table_from_entity(user_files::Entity)
                    .if_not_exists()
                    .to_owned(),
            ),
            (
                "tags",
                schema
                    .create_table_from_entity(tags::Entity)
                    .if_not_exists()
                    .to_owned(),
            ),
            (
                "file_metadata",
                schema
                    .create_table_from_entity(file_metadata::Entity)
                    .if_not_exists()
                    .to_owned(),
            ),
            (
                "file_tags",
                schema
                    .create_table_from_entity(file_tags::Entity)
                    .if_not_exists()
                    .to_owned(),
            ),
        ];

        for (name, stmt) in stmts {
            let stmt = builder.build(&stmt);
            match db.execute(stmt).await {
                Ok(_) => info!("   - Table '{}' checked/created", name),
                Err(e) => tracing::warn!("   - Failed to create table '{}': {}", name, e),
            }
        }

        // Manual migration for new features (Folders)
        // We use raw SQL because SeaORM's create_table_from_entity is additive-only for tables, not columns
        info!("🔄 Checking for schema updates...");
        
        let schema_updates = vec![
            "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS parent_id VARCHAR(255) DEFAULT NULL",
            "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS is_folder BOOLEAN DEFAULT FALSE",
            "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL",
            "ALTER TABLE user_files ALTER COLUMN storage_file_id DROP NOT NULL", 
            // Indexes for robust search
            "CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_files_parent_id ON user_files(parent_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_files_filename ON user_files(filename)",
            "CREATE INDEX IF NOT EXISTS idx_user_files_created_at ON user_files(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_user_files_deleted_at ON user_files(deleted_at)",
            "CREATE INDEX IF NOT EXISTS idx_file_metadata_category ON file_metadata(category)",
            "CREATE INDEX IF NOT EXISTS idx_file_metadata_storage_file_id ON file_metadata(storage_file_id)",
        ];

        for query in schema_updates {
            match db.execute(sea_orm::Statement::from_string(db.get_database_backend(), query.to_owned())).await {
               Ok(_) => info!("   - Executed schema update: {}", query),
               Err(e) => {
                   // sqlite doesn't support ALTER COLUMN DROP NOT NULL the same way, and IF NOT EXISTS on indexes is fine
                   // We ignore errors here as some might be DB-specific or already done
                   tracing::debug!("   - Schema update info (ignoring): {} -> {}", query, e);
               }
            }
        }
    }

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

    // Load security config
    let security_config = rust_file_backend::config::SecurityConfig::from_env();
    info!(
        "🛡️  Security Config: Max Size={}MB, Virus Scan={}, Scanner={}",
        security_config.max_file_size / 1024 / 1024,
        security_config.enable_virus_scan,
        security_config.virus_scanner_type
    );

    let s3_client = aws_sdk_s3::Client::from_conf(s3_config);
    let storage_service = Arc::new(StorageService::new(s3_client, bucket));
    let scanner_service =
        rust_file_backend::services::scanner::create_scanner(&security_config.virus_scanner_type);

    // Warm up scanner connection
    if security_config.enable_virus_scan {
        if scanner_service.health_check().await {
            info!("🦠 Virus scanner connected successfully");
        } else {
            tracing::warn!(
                "⚠️  Virus scanner unreachable! Uploads may be rejected or skipped depending on policy."
            );
        }
    }

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service.into(),
        config: security_config.clone(),
    };

    // Start expiration worker
    let worker_db = db.clone();
    let worker_storage = storage_service.clone();
    tokio::spawn(async move {
        expiration_worker(worker_db, worker_storage).await;
    });

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
        .layer(axum::extract::DefaultBodyLimit::max(
            security_config.max_file_size,
        ));

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
