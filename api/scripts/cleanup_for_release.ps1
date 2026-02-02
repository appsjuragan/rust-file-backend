# Cleanup Script for Beta 4 Release
# This script cleans the database and MinIO storage

Write-Host "=== Rust File Backend - Beta 4 Cleanup Script ===" -ForegroundColor Cyan
Write-Host ""

# Stop the application if running
Write-Host "Stopping application..." -ForegroundColor Yellow
Get-Process -Name "rust-file-backend" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "✓ Application stopped" -ForegroundColor Green
Write-Host ""

# Clean SQLite database
Write-Host "Cleaning SQLite database..." -ForegroundColor Yellow
if (Test-Path "file_storage.db") {
    Remove-Item "file_storage.db" -Force
    Write-Host "✓ Removed file_storage.db" -ForegroundColor Green
} else {
    Write-Host "  No SQLite database found" -ForegroundColor Gray
}

if (Test-Path "file_storage.db-shm") {
    Remove-Item "file_storage.db-shm" -Force
}

if (Test-Path "file_storage.db-wal") {
    Remove-Item "file_storage.db-wal" -Force
}
Write-Host ""

# Clean MinIO bucket using mc (MinIO Client)
Write-Host "Cleaning MinIO storage..." -ForegroundColor Yellow
Write-Host "  Checking if MinIO Client (mc) is available..." -ForegroundColor Gray

if (Get-Command mc -ErrorAction SilentlyContinue) {
    Write-Host "  ✓ MinIO Client found" -ForegroundColor Green
    
    # Configure mc alias if not exists
    mc alias set local http://127.0.0.1:9000 minioadmin minioadmin 2>$null
    
    # Remove all objects from uploads bucket
    Write-Host "  Removing all files from 'uploads' bucket..." -ForegroundColor Gray
    mc rm --recursive --force local/uploads/ 2>$null
    
    Write-Host "✓ MinIO storage cleaned" -ForegroundColor Green
} else {
    Write-Host "  ⚠ MinIO Client (mc) not found. Please clean MinIO manually:" -ForegroundColor Yellow
    Write-Host "    1. Open MinIO Console: http://127.0.0.1:9001" -ForegroundColor Gray
    Write-Host "    2. Login with minioadmin/minioadmin" -ForegroundColor Gray
    Write-Host "    3. Navigate to 'uploads' bucket" -ForegroundColor Gray
    Write-Host "    4. Delete all objects" -ForegroundColor Gray
}
Write-Host ""

# Clean PostgreSQL database (if configured)
Write-Host "PostgreSQL cleanup..." -ForegroundColor Yellow
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "DATABASE_URL=postgres") {
        Write-Host "  PostgreSQL detected in .env" -ForegroundColor Gray
        Write-Host "  ⚠ Please clean PostgreSQL manually:" -ForegroundColor Yellow
        Write-Host "    Run: psql -U postgres -d file_storage -c 'TRUNCATE TABLE users, tokens, storage_files, user_files, file_metadata, tags, file_tags CASCADE;'" -ForegroundColor Gray
    } else {
        Write-Host "  No PostgreSQL configuration found" -ForegroundColor Gray
    }
} else {
    Write-Host "  No .env file found" -ForegroundColor Gray
}
Write-Host ""

Write-Host "=== Cleanup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Start MinIO: docker-compose up -d" -ForegroundColor Gray
Write-Host "  2. Start the application: cargo run --release" -ForegroundColor Gray
Write-Host "  3. Access the web interface: http://localhost:8080" -ForegroundColor Gray
Write-Host ""
