# Release Notes

## Version 1.0.8-beta (2026-02-11)

### 🛡️ Security & Stability
- **CAPTCHA Bot Protection**: Implemented a robust CAPTCHA system for user registration and sensitive endpoints to mitigate automated bot attacks.
- **Enhanced Input Validation**: 
  - Integrated entropy analysis to detect packed/encrypted malicious binaries.
  - Added script injection (XSS) scanning for text and media file headers.
- **Dependency Audit**: Updated core dependencies to latest stable versions for enhanced security and performance.
- **Improved PDF Preview**: Optimized security headers (`Content-Security-Policy` and `X-Frame-Options`) to allow safe inline PDF viewing.

### 🧩 Features & UX
- **Avatar Management**: Added support for user profile avatars with automated image processing.
- **Advanced Metadata Extraction**: Improved extraction for PDF and Office documents, including page counts and author info.
- **UI Polishing**: Finalized glassmorphic design system with improved micro-animations and responsive layouts across all viewports.
- **Recursive Operations**: Optimized asynchronous recursive logic for bulk copy/paste operations on large folder structures.

### 🧹 Maintenance & Infrastructure
- **Version Unified**: Synchronized backend and frontend versions to `1.0.8`.
- **Documentation Overhaul**: 
  - Completely rewritten root `README.md` with updated architecture and quick-start guides.
  - Updated `ARCHITECTURE.md` to reflect new security layers (CAPTCHA, validation).
  - Refreshed API documentation with new endpoints (captcha, avatar, health).
- **CI/CD Optimization**: Refined GitHub Actions workflows for the nested monorepo structure.
- **Cleaned Workspace**: Removed legacy scripts and temporary files.

---

## Version 0.1.0-beta.6 (2026-02-03)

### 🛡️ Security Updates

#### **Dependency Vulnerability Fixes**
- **Backend (Rust)**:
  - Upgraded `sqlx` from 0.7 to 0.8.6 (fixes high-severity binary protocol misinterpretation vulnerability)
  - Upgraded `sea-orm` from 0.12 to 1.1.19 for compatibility with new sqlx
  - Updated `jsonwebtoken` to 9.3.1, `openidconnect` to 4.0.1, `reqwest` to 0.12.28
  - Removed unused direct `rsa` dependency
- **Frontend (React)**:
  - Applied security overrides for transitive dependencies:
    - `cross-spawn` ^7.0.5 (ReDoS fix)
    - `glob` ^10.5.0 (Command injection fix)
    - `braces` ^3.0.3 (Uncontrolled resource consumption)
    - `micromatch` ^4.0.8 (ReDoS fix)
    - `esbuild` ^0.25.0 (Dev server security fix)
  - `bun audit` now reports 0 vulnerabilities

### 🧹 Codebase Cleanup

#### **Production-Ready Polishing**
- **Removed Temporary Files**:
  - Deleted redundant `BETA4_RELEASE_CHECKLIST.md`, `BETA5_RELEASE_CHECKLIST.md`, `CLEANUP_INSTRUCTIONS.md`
  - Removed 5 redundant end-to-end test scripts, consolidated into `comprehensive_test.ps1`
  - Removed unused Storybook files from frontend
  - Cleaned up `package-lock.json` (now using `bun.lock` exclusively)
- **Code Quality**:
  - All Clippy warnings resolved
  - Codebase formatted with `cargo fmt`
  - All 16+ backend tests passing

### 📚 Documentation Updates
- **README.md**: Added complete API endpoint reference table
- **ARCHITECTURE.md**: Comprehensive rewrite with all services, handlers, and data models
- **Postman Collection**: Updated with all 25+ endpoints for v0.1.0-beta.6
- **OpenAPI Spec**: Added missing `generate_download_ticket` and `download_file_with_ticket` endpoints

---

## Version 0.1.0-beta.5 (2026-02-02)
...
