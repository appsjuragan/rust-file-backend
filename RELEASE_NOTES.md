# Release Notes

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
