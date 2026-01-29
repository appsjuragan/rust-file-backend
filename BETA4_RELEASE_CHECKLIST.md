# Beta 4 Release Preparation Checklist

## Version Information
- **Version**: 0.1.0-beta.4
- **Release Date**: January 29, 2026
- **Previous Version**: 0.1.0-beta.3

## Pre-Release Tasks Completed

### ✅ Code Quality
- [x] Applied `cargo fmt` to entire codebase
- [x] Fixed all clippy warnings in production code
- [x] Collapsed nested if statements for better readability
- [x] Removed unnecessary type casts
- [x] Fixed Arc reference handling

### ✅ Version Updates
- [x] Updated `Cargo.toml` version to 0.1.0-beta.4
- [x] Updated `README.md` version badge
- [x] Updated `RELEASE_NOTES.md` with new features

### ✅ New Features Implemented
- [x] RAR archive support with `unrar` crate
- [x] Sticky table headers in file list
- [x] Fixed scrolling behavior in file manager
- [x] Enhanced UI/UX with better visual separation

### ✅ Documentation
- [x] Updated RELEASE_NOTES.md with comprehensive changelog
- [x] Created cleanup script (`scripts/cleanup_for_release.ps1`)
- [x] Documented RAR library requirements

## Pre-Release Cleanup Tasks

### 🔧 Database Cleanup
Run the cleanup script:
```powershell
.\scripts\cleanup_for_release.ps1
```

Or manually:
```powershell
# Stop application
Get-Process -Name "rust-file-backend" -ErrorAction SilentlyContinue | Stop-Process -Force

# Remove SQLite database
Remove-Item file_storage.db* -Force

# For PostgreSQL
psql -U postgres -d file_storage -c 'TRUNCATE TABLE users, tokens, storage_files, user_files, file_metadata, tags, file_tags CASCADE;'
```

### 🗄️ MinIO Storage Cleanup
Using MinIO Client (mc):
```powershell
mc alias set local http://127.0.0.1:9000 minioadmin minioadmin
mc rm --recursive --force local/uploads/
```

Or via MinIO Console:
1. Open http://127.0.0.1:9001
2. Login: minioadmin / minioadmin
3. Navigate to 'uploads' bucket
4. Delete all objects

## Testing Checklist

### 🧪 Manual Testing
- [ ] Register new user
- [ ] Login and receive JWT token
- [ ] Upload various file types (images, documents, archives)
- [ ] Test file preview (images, PDFs, text files)
- [ ] Test archive preview (ZIP, 7z, TAR, TAR.GZ, RAR)
- [ ] Verify sticky headers while scrolling
- [ ] Test folder creation and navigation
- [ ] Test file deletion
- [ ] Test bulk operations
- [ ] Verify deduplication works correctly

### 🔍 Archive Format Testing
Test each archive format:
- [ ] ZIP files
- [ ] 7z files
- [ ] TAR files
- [ ] TAR.GZ files
- [ ] RAR files (requires UnRAR library)

### 📱 UI/UX Testing
- [ ] Verify table headers stay fixed on scroll
- [ ] Check folder path remains visible
- [ ] Test with long file lists (100+ files)
- [ ] Verify responsive layout
- [ ] Check dark mode compatibility

## Build and Deployment

### 🏗️ Build Commands
```powershell
# Development build
cargo build

# Release build (optimized)
cargo build --release

# Run tests
cargo test

# Check for issues
cargo clippy --all-targets --all-features
```

### 📦 Release Artifacts
- [ ] Compiled binary (`target/release/rust-file-backend.exe`)
- [ ] Updated documentation
- [ ] Migration scripts (if any)
- [ ] Configuration examples (`.env.example`)

## Known Issues and Limitations

### ⚠️ RAR Support
- Requires UnRAR library to be installed on the server
- Installation instructions:
  - **Windows**: Download from https://www.rarlab.com/rar_add.htm
  - **Linux**: `sudo apt-get install unrar` or `sudo yum install unrar`
  - **macOS**: `brew install unrar`

### 🐛 Test Warnings
- Some test files have clippy warnings (non-critical)
- ClamAV test requires scanner to be running
- Integration tests require MinIO to be running

## Post-Release Tasks

### 📢 Communication
- [ ] Update GitHub release notes
- [ ] Tag release in Git: `git tag v0.1.0-beta.4`
- [ ] Push tags: `git push --tags`
- [ ] Update project documentation
- [ ] Notify stakeholders

### 📊 Monitoring
- [ ] Monitor error logs for first 24 hours
- [ ] Check performance metrics
- [ ] Gather user feedback
- [ ] Track any new issues

## Rollback Plan
If critical issues are discovered:
1. Revert to beta.3: `git checkout v0.1.0-beta.3`
2. Rebuild: `cargo build --release`
3. Restore database backup (if needed)
4. Communicate rollback to users

## Success Criteria
- ✅ All production code passes clippy without warnings
- ✅ Application starts without errors
- ✅ All core features functional
- ✅ RAR preview works (with library installed)
- ✅ UI improvements visible and functional
- ✅ No regression in existing features

## Notes
- This is a beta release; some features may still be refined
- User feedback is encouraged
- Report issues at: https://github.com/appsjuragan/rust-file-backend/issues

---

**Prepared by**: Development Team  
**Date**: January 29, 2026  
**Status**: Ready for Release
