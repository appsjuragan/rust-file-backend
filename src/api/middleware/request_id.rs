use axum::{
    extract::Request,
    http::HeaderValue,
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

pub async fn request_id_middleware(mut req: Request, next: Next) -> Response {
    let request_id = req
        .headers()
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    req.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(&request_id).unwrap(),
    );

    let mut response = next.run(req).await;

    response.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(&request_id).unwrap(),
    );

    response
}
