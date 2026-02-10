# OWASP Scan Report & Remediation

**Target:** `https://myfiles1.thepihouse.my.id/`
**Date:** 2026-02-10

## Summary of Fixes

Based on the ZAP Report (`zap_report.md`) and Quick Scan (`quick_report.md`), the following security enhancements have been implemented in the Rust backend:

### 1. Cross-Domain Misconfiguration (Medium)
- **Issue:** CORS policy was too permissive or not configured securely.
- **Fix:** Implemented dynamic CORS configuration based on `ALLOWED_ORIGINS` environment variable.
- **Action Required:** Set `ALLOWED_ORIGINS` in production environment (e.g., `https://myfiles1.thepihouse.my.id`).

### 2. Missing Security Headers (Low - High)
- **Issue:** Several critical security headers were missing (`Strict-Transport-Security`, `X-Content-Type-Options`, `Cross-Origin-Resource-Policy`).
- **Fix:** Created a dedicated `security_headers` middleware in `api/src/api/middleware/security.rs` that applies:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` coverage.
  - `X-Content-Type-Options: nosniff` to prevent MIME sniffing.
  - `Cross-Origin-Resource-Policy: same-origin` to mitigate Spectre attacks.

### 3. Cache Control (Informational)
- **Issue:** Sensitive content might be cached by shared proxies.
- **Fix:** 
  - Added default `Cache-Control: no-cache, no-store, must-revalidate` to all API responses via middleware.
  - Updated file download handler (`api/src/api/handlers/files.rs`) to use `private, max-age=31536000` instead of `public`, ensuring only the user's browser (and not shared proxies) caches the file content.

## Verification
- Run `cargo check` to ensure code integrity.
- Deploy the updated binary.
- Verify headers using `curl -I https://myfiles1.thepihouse.my.id/` after deployment.

## Next Steps
- Ensure `ALLOWED_ORIGINS` is set in your deployment environment.
- Consider adding `Content-Security-Policy` (CSP) if the API serves HTML content (currently it seems to be a pure JSON API + file download, so CSP is less critical but good practice).
