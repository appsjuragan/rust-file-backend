use clap::Parser;
use dotenvy::dotenv;
use rust_file_backend::infrastructure::{database, scanner, storage};
use rust_file_backend::services::file_service::FileService;
use rust_file_backend::{AppState, create_app};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::signal;
use tower_http::trace::TraceLayer;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Service type to run (api, worker, all)
    #[arg(short, long, default_value = "all")]
    mode: String,

    /// Port for the API server
    #[arg(short, long, default_value_t = 3000)]
    port: u16,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Initial Environment & Logging Setup
    dotenv().ok();
    let args = Args::parse();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rust_file_backend=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("🚀 Starting Rust File Backend [Mode: {}]...", args.mode);

    // 2. Setup Common Infrastructure
    let db = database::setup_database().await?;
    let storage_service = storage::setup_storage().await;

    // Load security config
    let security_config = rust_file_backend::config::SecurityConfig::from_env();
    info!(
        "🛡️  Security Config: Max Size={}MB, Virus Scan={}, Scanner={}",
        security_config.max_file_size / 1024 / 1024,
        security_config.enable_virus_scan,
        security_config.virus_scanner_type
    );

    let scanner_service = scanner::setup_scanner(&security_config).await;

    // 3. Setup Graceful Shutdown Channel
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    let mut handles = Vec::new();

    // 4. Initialize Worker Service
    if args.mode == "worker" || args.mode == "all" {
        let worker_db = db.clone();
        let worker_storage = storage_service.clone();
        let worker_scanner = scanner_service.clone();
        let worker_config = security_config.clone();
        let worker_shutdown = shutdown_rx.clone();

        let worker_handle = tokio::spawn(async move {
            let worker = rust_file_backend::services::worker::BackgroundWorker::new(
                worker_db,
                worker_storage,
                worker_scanner,
                worker_config,
                worker_shutdown,
            );
            worker.run().await;
        });
        handles.push(worker_handle);
        info!("👷 Worker service initialized.");
    }

    // 5. Initialize API Service
    if args.mode == "api" || args.mode == "all" {
        let file_service = Arc::new(FileService::new(
            db.clone(),
            storage_service.clone(),
            scanner_service.clone(),
            security_config.clone(),
        ));

        let upload_service = Arc::new(rust_file_backend::services::upload_service::UploadService::new(
            db.clone(),
            storage_service.clone(),
            security_config.clone(),
            file_service.clone(),
        ));

        let state = AppState {
            db: db.clone(),
            storage: storage_service.clone(),
            scanner: scanner_service.clone(),
            file_service,
            upload_service,
            config: security_config.clone(),
            download_tickets: Arc::new(dashmap::DashMap::new()),
        };

        // Configure tracing layer for HTTP requests
        let trace_layer = TraceLayer::new_for_http()
            .make_span_with(|request: &axum::http::Request<_>| {
                let request_id = request
                    .headers()
                    .get("x-request-id")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("unknown");
                tracing::info_span!(
                    "http_request",
                    method = %request.method(),
                    uri = %request.uri(),
                    request_id = %request_id,
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
            );

        let app = create_app(state).layer(trace_layer);
        let addr = SocketAddr::from(([0, 0, 0, 0], args.port));
        let listener = tokio::net::TcpListener::bind(addr).await?;

        info!("✅ API Server listening on: http://0.0.0.0:{}", args.port);
        info!("📖 Swagger UI documentation: http://localhost:{}/swagger-ui", args.port);

        let server_handle = tokio::spawn(async move {
            if let Err(e) = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    shutdown_signal().await;
                })
                .await
            {
                error!("❌ Server runtime error: {}", e);
            }
        });
        handles.push(server_handle);
    }

    // 6. Wait for Shutdown Signal
    if args.mode == "worker" {
        // Special wait for standalone worker mode
        shutdown_signal().await;
        let _ = shutdown_tx.send(true);
    } else {
        // API server's axum::serve handles the signal, but we need to notify the worker
        shutdown_signal().await;
        let _ = shutdown_tx.send(true);
    }

    info!("🛑 Shutting down backend services...");
    
    // Optional: Wait for tasks to complete
    // for handle in handles { let _ = handle.await; }

    info!("👋 Backend exited cleanly.");
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
            info!("⌨️  Ctrl+C received, initiating graceful shutdown...");
        },
        _ = terminate => {
            info!("💤 SIGTERM received, initiating graceful shutdown...");
        },
    }
}

