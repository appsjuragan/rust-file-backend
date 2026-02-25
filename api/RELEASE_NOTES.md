# Release Notes

## Version 1.1.0 (2026-02-25)

### 🔗 File Sharing
- **Share Link Management**: Create, list, and revoke share links for files and folders.
- **Password Protection**: Argon2id-hashed passwords with per-share random salts.
- **Permission Model**: `view` (inline display) and `download` (attachment) modes.
- **Expiration Control**: Configurable expiry up to 1 year with server-side enforcement.
- **Access Logging**: Track every view, download, and password attempt with IP/User-Agent.
- **Public Share Page**: Standalone viewer with password gate, media preview (image, video, audio, PDF), folder browsing, and branded design.
- **Sidebar Integration**: Active shares listed in sidebar with click-to-navigate and view/download shortcuts.

### 🖼️ Thumbnail Generation
- **WebP Thumbnails**: Auto-generated for images, PDFs, and videos (256×256).
- **Thumbnail Worker**: Dedicated `--mode thumbnail-worker` process for background generation.
- **PDF Thumbnails**: First-page rendering via `pdftocairo` (poppler-utils).
- **Video Thumbnails**: Frame extraction at 1s mark via `ffmpeg`.
- **Encrypted Detection**: Password-protected PDFs flagged with `is_encrypted` instead of failing.
- **Lazy Loading**: Frontend loads thumbnails asynchronously with smooth fade-in animations.

### ⭐ Favorites
- **Toggle Favorites**: Star/unstar files and folders from context menu.
- **Favorites Filter**: Filter file listing to show only favorited items.
- **Sidebar Favorites**: Quick access to favorited items from the sidebar.

### 🧩 Features & UX
- **Folder Tree**: Full navigational tree for move/copy target selection.
- **Advanced Search**: Regex, wildcard, fuzzy, date/size range, tag, and category filters.
- **Sidebar Navigation**: Click shared items to navigate directly to their location.
- **Icon Sizing**: Fixed icon scaling on large/extra-large displays.

### 🧹 Cleanup & Release Prep
- **Version Unified**: Synchronized all version references to `1.1.0` (Cargo.toml, package.json, README, Postman, Architecture docs).
- **Removed Stale Files**: Cleaned up `minio.log`, `admin_files.txt`, `test_output.txt`, duplicate Postman collection, OIDC analysis doc.
- **Removed Debug Logs**: Cleaned all commented-out `console.log` statements from frontend.
- **Updated Postman Collection**: Added new endpoints for shares, thumbnails, favorites, folder tree, upload sessions.
- **Updated Documentation**: Root README, API README, Web README, ARCHITECTURE.md all refreshed for v1.1.0.
- **Docker**: Updated GHCR image tags and compose stack documentation.

---

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
