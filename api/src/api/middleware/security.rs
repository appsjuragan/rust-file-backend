use axum::{extract::Request, middleware::Next, response::Response, http::header};

pub async fn security_headers(req: Request, next: Next) -> Response {
    // 1. Reject TRACE and TRACK methods (OWASP Finding: Proxy Disclosure)
    let method = req.method();
    if method == "TRACE" || method == "TRACK" {
        return axum::response::Response::builder()
            .status(axum::http::StatusCode::METHOD_NOT_ALLOWED)
            .body(axum::body::Body::empty())
            .unwrap();
    }

    let mut response = next.run(req).await;
    let headers = response.headers_mut();

    // HSTS: 1 year, include subdomains
    headers.insert(
        header::STRICT_TRANSPORT_SECURITY,
        header::HeaderValue::from_static("max-age=31536000; includeSubDomains"),
    );

    // Content Security Policy for API (OWASP recommendation)
    // frame-ancestors 'self' http://localhost:* http://127.0.0.1:*; allows the frontend to frame the backend (e.g. for PDF previews)
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        header::HeaderValue::from_static("default-src 'none'; frame-ancestors 'self' http://localhost:* http://127.0.0.1:*;"),
    );

    // Referrer Policy
    headers.insert(
        header::REFERRER_POLICY,
        header::HeaderValue::from_static("strict-origin-when-cross-origin"),
    );

    // Permissions Policy (formerly Feature-Policy)
    headers.insert(
        header::HeaderName::from_static("permissions-policy"),
        header::HeaderValue::from_static("camera=(), microphone=(), geolocation=(), payment=()"),
    );

    // Prevent Flash/PDF from accessing content
    headers.insert(
        header::HeaderName::from_static("x-permitted-cross-domain-policies"),
        header::HeaderValue::from_static("master-only"),
    );

    // Prevent MIME sniffing
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        header::HeaderValue::from_static("nosniff"),
    );

    // Site Isolation
    headers.insert(
        header::HeaderName::from_static("cross-origin-resource-policy"),
        header::HeaderValue::from_static("cross-origin"),
    );

    // Suppress fingerprinting
    headers.insert(
        header::SERVER,
        header::HeaderValue::from_static("rust-file-backend"),
    );

    // Cache-Control for sensitive content
    if !headers.contains_key(header::CACHE_CONTROL) {
        headers.insert(
            header::CACHE_CONTROL,
            header::HeaderValue::from_static("no-cache, no-store, must-revalidate"),
        );
    }
    
    if !headers.contains_key(header::PRAGMA) {
        headers.insert(
            header::PRAGMA,
            header::HeaderValue::from_static("no-cache"),
        );
    }
    
    if !headers.contains_key(header::EXPIRES) {
        headers.insert(
            header::EXPIRES,
            header::HeaderValue::from_static("0"),
        );
    }

    response
}
