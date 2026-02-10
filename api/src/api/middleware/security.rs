use axum::{extract::Request, middleware::Next, response::Response, http::header};

pub async fn security_headers(req: Request, next: Next) -> Response {
    let mut response = next.run(req).await;
    let headers = response.headers_mut();

    // HSTS: 1 year, include subdomains
    headers.insert(
        header::STRICT_TRANSPORT_SECURITY,
        header::HeaderValue::from_static("max-age=31536000; includeSubDomains"),
    );

    // Prevent MIME sniffing
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        header::HeaderValue::from_static("nosniff"),
    );

    // Site Isolation
    headers.insert(
        header::HeaderName::from_static("cross-origin-resource-policy"),
        header::HeaderValue::from_static("same-origin"),
    );

    // Cache-Control for sensitive content
    // We apply this broadly, but specific handlers can override if needed by setting the header before this middleware runs (wait, middleware runs *after* handler returns response, so we only set if missing)
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
