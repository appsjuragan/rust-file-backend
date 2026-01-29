# Release Notes

## Version 0.1.0-beta.4 (2026-01-29)

### New Features
- **RAR Archive Support**: Added full support for RAR archive preview using the `unrar` crate. Users can now preview the contents of RAR files alongside ZIP, 7z, TAR, and TAR.GZ formats.
- **Enhanced File List UI**: 
  - Implemented sticky table headers that remain visible while scrolling through long file lists
  - Fixed scrolling behavior to keep folder path and controls fixed at the top
  - Added visual separation with bottom borders on sticky headers
- **Improved Archive Preview**: Extended archive content preview to support multiple formats (ZIP, 7z, TAR, TAR.GZ, RAR) with file names and sizes displayed in a clean interface.

### UI/UX Improvements
- **Better Scrolling**: File listing area now properly scrolls while keeping navigation elements fixed
- **Visual Polish**: Added subtle borders and improved spacing for better readability
- **Responsive Layout**: Enhanced flexbox layout ensures proper height calculations and overflow handling

### Code Quality
- **Clippy Compliance**: Fixed all clippy warnings for production code
- **Code Formatting**: Applied `cargo fmt` across the entire codebase
- **Refactoring**: Collapsed nested if statements for better readability
- **Type Safety**: Removed unnecessary type casts and improved Arc reference handling

### Dependencies
- Added `unrar` v0.5.8 for RAR archive support

### Notes
- RAR preview requires the UnRAR library to be installed on the server
- All existing features from beta.3 remain fully functional

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
