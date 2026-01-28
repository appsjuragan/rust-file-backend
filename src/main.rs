use dotenvy::dotenv;
use rust_file_backend::infrastructure::{database, scanner, storage};
use rust_file_backend::services::file_service::FileService;
use rust_file_backend::{AppState, create_app};
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

    // Setup Infrastructure
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
    let file_service = Arc::new(FileService::new(
        db.clone(),
        storage_service.clone(),
        scanner_service.clone(),
        security_config.clone(),
    ));

    let state = AppState {
        db: db.clone(),
        storage: storage_service.clone(),
        scanner: scanner_service,
        file_service,
        config: security_config.clone(),
    };

    // Setup Shutdown Channel
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

    // Start Background Worker
    let worker = rust_file_backend::services::worker::BackgroundWorker::new(
        db.clone(),
        storage_service.clone(),
        shutdown_rx,
    );
    tokio::spawn(async move {
        worker.run().await;
    });

    let app = create_app(state)
        .layer(
            TraceLayer::new_for_http()
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
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            let _ = shutdown_tx.send(true);
        })
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
