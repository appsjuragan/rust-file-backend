use axum::{
    extract::Request,
    middleware::Next,
    response::Response,
};
use std::time::Instant;
use tracing::info;

pub async fn metrics_middleware(req: Request, next: Next) -> Response {
    let start = Instant::now();
    let method = req.method().clone();
    let uri = req.uri().clone();

    let response = next.run(req).await;

    let latency = start.elapsed();
    let status = response.status();

    info!(
        target: "metrics",
        method = %method,
        uri = %uri,
        status = %status.as_u16(),
        latency_ms = %latency.as_millis(),
        "request_completed"
    );

    response
}
