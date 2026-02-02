# Release Notes

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

### 🎯 Major Architectural Changes

#### **Project Reorganization (Monorepo Structure)**
- **Infrastructure Separation**: Completely separated backend and frontend codebases into dedicated `api/` and `web/` directories.
- **Monorepo Management**: Updated root-level scripts and configuration to handle the new directory structure.
- **Clean Workspace**: Improved `.gitignore` and build artifact management for the nested structure.

#### **Comprehensive Testing Suite**
- **Full Swagger Endpoint Verification**: Added `api/scripts/test_swagger_endpoints.ps1`, a robust testing script that validates every REST endpoint.
- **Negative Scenario Coverage**: Integrated tests for unauthorized access, duplicate registrations, and invalid payloads.
- **Automated Validation**: Enhanced `api/scripts/comprehensive_test.ps1` to cover the full end-to-end user lifecycle from registration to soft-deletion.

### 🎨 UI/UX & Tooling
- **Unified Startup script**: Enhanced the root `run.bat` to automatically handle environment setup and start both API and React services in separate windows.
- **Documentation Migration**: Moved all technical architecture and OIDC integration documentation into the `api/` directory for better context.

### 🧹 Code Quality
- **Refactored Service Layer**: Updated imports and path handling to support the new directory nesting.
- **Cleaned Root Directory**: Removed legacy build logs and temporary files from the project root.

---

## Version 0.1.0-beta.4 (2026-01-31)


### 🎯 Major Features

#### **File Statistics & Analytics**
- **Per-User File Facts**: Real-time statistics tracking for each user including:
  - Total file count and storage size
  - Categorized file counts (images, videos, audio, documents, others)
  - Automatic background updates with intelligent caching (10-second refresh threshold)
- **Interactive Storage Visualization**: 
  - Beautiful SVG-based pie chart showing file type distribution
  - Hover effects with smooth transitions and scaling animations
  - Synchronized highlighting between pie chart segments and category legend
  - Empty state handling with graceful fallback display

#### **Archive Support**
- **RAR Archive Support**: Added full support for RAR archive preview using the `unrar` crate
- **Multi-Format Preview**: Support for ZIP, 7z, TAR, TAR.GZ, and RAR formats with file names and sizes

### 🎨 UI/UX Improvements
- **Enhanced File List UI**: 
  - Sticky table headers that remain visible while scrolling through long file lists
  - Fixed scrolling behavior to keep folder path and controls at the top
  - Visual separation with bottom borders on sticky headers
- **Interactive Sidebar**:
  - Dynamic pie chart with hover interactions
  - Category highlighting with visual feedback
  - Smooth animations and transitions throughout
- **Better Scrolling**: File listing area now properly scrolls while keeping navigation elements fixed
- **Visual Polish**: Added subtle borders and improved spacing for better readability

### ⚡ Performance Optimizations
- **Background Worker Efficiency**: 
  - Optimized intervals (virus scan: 10s, facts update: 60s, cleanup: 60s)
  - Reduced frontend polling from 5s to 60s for facts updates
  - Intelligent caching prevents unnecessary database queries
- **Database Optimization**: 
  - Fixed join relationships in facts_service for proper metadata retrieval
  - Added comprehensive logging for debugging and monitoring

### 🧹 Code Quality
- **Production-Ready Cleanup**:
  - Removed all debug console.log statements
  - Deleted 16 temporary inspection/debug scripts from src/bin/
  - Applied `cargo fmt` across entire codebase
- **Clippy Compliance**: Fixed all clippy warnings for production code
- **Type Safety**: Improved Arc reference handling and removed unnecessary type casts
- **Better Architecture**: Collapsed nested if statements for improved readability

### 🗄️ Database Changes
- **New Schema**: Added `image_count` field to `user_file_facts` table
- **Auto-Migration**: Automatic schema updates on application startup

### 📦 Dependencies
- Added `unrar` v0.5.8 for RAR archive support

### 📝 Notes
- RAR preview requires the UnRAR library to be installed on the server
- All existing features from beta.3 remain fully functional
- Recommended to clear browser cache for optimal UI experience

## Version 0.1.0-beta.3 (2026-01-26)

### New Features
- **PostgreSQL Support**: Added full support for PostgreSQL as the primary database backend.
- **SeaORM Migration**: Migrated from raw SQLx to SeaORM for improved type safety and database portability.
- **Auto-Migration**: Application now automatically creates necessary database tables on startup.
- **Multi-Database Support**: Seamlessly supports both PostgreSQL and SQLite via configuration.

### Improvements
- **Code Quality**: Refactored codebase to use SeaORM entities and active models.
- **Testing**: Enhanced test suite with SeaORM integration and added comprehensive end-to-end `curl` test script (`scripts/test_full_flow.ps1`).
- **Verification**: Updated `verify_upload` example to support PostgreSQL and integrated it directly into the full flow test script for automated persistence checks.
- **Security**: Updated security configuration options in `.env.example`.

### Dependency Updates
- Added `sea-orm` v0.12.


## Version 0.1.0-beta.2 (2026-01-26)

### New Features
- **Large File Support**: Increased maximum file upload size to **1GB** (previously 256MB).
- **Verified Deduplication**: Implemented comprehensive testing and logic to ensuring duplicate files are not stored twice in Object Storage (S3/MinIO), saving space while maintaining unique user references.
- **Persistence Verification**: Added tooling to verify file integrity across the Database and Object Storage layers.
- **Upload Streaming**: Optimized upload handlers to stream data directly to S3, minimizing memory footprint during large uploads.

### Improvements
- **Configuration**: `MAX_FILE_SIZE` is now easily configurable via environment variables.
- **Testing**: Added `tests/large_upload_test.rs` to validate handling of 50MB, 200MB, and 300MB files.
- **Documentation**: Updated README with instructions for large file testing and verification tools.

### Bug Fixes
- Fixed compiler warnings related to unused imports in file handlers.
- Fixed an issue where the database was not automatically created if missing.

### Dependency Updates
- Bumped version to `0.1.0-beta.2`.
