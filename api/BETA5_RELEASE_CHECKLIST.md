# Beta 5 Release Preparation Checklist

## Version Information
- **Version**: 0.1.0-beta.5
- **Release Date**: February 2, 2026
- **Previous Version**: 0.1.0-beta.4

## Pre-Release Tasks Completed

### ✅ Project Structure
- [x] Moved all backend source code to `api/` directory
- [x] Moved migrations, tests, and examples to `api/`
- [x] Updated root `run.bat` to support new paths
- [x] Configured nested `.gitignore` files

### ✅ Testing
- [x] Verified `api/scripts/comprehensive_test.ps1` passes
- [x] Verified `api/scripts/test_swagger_endpoints.ps1` passes (Positive & Negative)
- [x] Manually verified `run.bat` starts all services

### ✅ Version Updates
- [x] Updated `api/Cargo.toml` version to 0.1.0-beta.5
- [x] Updated `web/package.json` version to 0.1.0-beta.5
- [x] Updated `README.md` with new project structure and instructions
- [x] Updated `api/RELEASE_NOTES.md` with Beta 5 changes

### ✅ Documentation
- [x] Migrated `ARCHITECTURE.md` to `api/`
- [x] Migrated OIDC documentation to `api/`
- [x] Updated release notes and checklist

## Pre-Release Cleanup Tasks

### 🔧 Database Cleanup
Run the comprehensive test script (which resets the DB) or manual cleanup:
```powershell
# Reset SQLite for clean release testing
cd api
powershell -ExecutionPolicy Bypass -File scripts/comprehensive_test.ps1
```

## Testing Checklist

### 🧪 Integration Testing
- [x] User Registration (Positive/Negative)
- [x] User Login (Positive/Negative)
- [x] Folder Creation & Navigation
- [x] File Upload & Filtering
- [x] Content Deduplication
- [x] Soft Deletion & Bulk Operations
- [x] User Profile & Avatar Updates
- [x] User Facts & Storage Stats

### 🏗️ Build and Deployment
- [ ] Production build verification: `cd api && cargo build --release`
- [ ] Frontend build verification: `cd web && bun run build`

## Success Criteria
- ✅ Backend and Frontend are successfully separated
- ✅ All integration tests pass in the new structure
- ✅ `run.bat` provides a smooth developer experience
- ✅ Documentation accurately reflects the new structure

---

**Prepared by**: Antigravity AI  
**Date**: February 2, 2026  
**Status**: Ready for Beta Release
