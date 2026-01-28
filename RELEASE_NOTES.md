# Release Notes

## Version 0.1.0-beta.4 (2026-01-28)

### Architectural Improvements
- **Modular Architecture**: Restructured the codebase into `api`, `services`, and `infrastructure` layers for better separation of concerns.
- **Service Layer**: Extracted business logic into dedicated services (`FileService`, `StorageService`, `StorageLifecycleService`), decoupling it from HTTP handlers.
- **Dependency Injection**: Implemented dependency injection using traits for `StorageService` and `VirusScanner`, enabling easier testing and flexibility.
- **Centralized Error Handling**: Introduced a unified `AppError` type for consistent error reporting across the API.

### Testing
- **Integration Tests**: Added `tests/api_integration_test.rs` with a `MockStorageService` to validate the full API flow (Register -> Login -> Upload -> Download -> Delete) without external dependencies.
- **Test Suite Updates**: Updated existing tests (`upload_test.rs`, `deduplication_deletion_test.rs`, etc.) to align with the new modular architecture.

### CI/CD
- **GitHub Actions**: Added `.github/workflows/ci.yml` for automated testing, formatting, and linting on every push and pull request.

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
