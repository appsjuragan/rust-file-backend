# test_metadata.ps1
# Tests metadata extraction for uploaded files using cURL and checks the Database
# Iterates through all files in scripts/test_metadata

# 1. Setup
Write-Host "--- Setting up Metadata Test ---"
$env:VIRUS_SCANNER_TYPE = "noop"
$env:RUST_LOG = "info"
$baseUrl = "http://127.0.0.1:3000"

# Start Server
Write-Host "Starting server..."
$serverProcess = Start-Process -FilePath "cargo" -ArgumentList "run" -PassThru -NoNewWindow
Write-Host "Server started with PID $($serverProcess.Id). Waiting for port 3000..."

# Wait for port 3000
$retries = 0
while ($retries -lt 30) {
    $conn = Test-NetConnection -ComputerName "127.0.0.1" -Port 3000 -InformationLevel Quiet
    if ($conn) {
        Write-Host "Server is UP!"
        break
    }
    Start-Sleep -Seconds 2
    $retries++
}

if ($retries -eq 30) {
    Write-Host "Server failed to start in time."
    Stop-Process -Id $serverProcess.Id
    Exit
}

# 2. Auth Setup
Set-Content -Path "auth.json" -Value '{"username": "meta_user", "password": "password123"}'

Write-Host "`n--- 1. Authentication ---"
$reg = curl.exe -s -X POST "$baseUrl/register" -H "Content-Type: application/json" -d "@auth.json"
$login_resp = curl.exe -s -X POST "$baseUrl/login" -H "Content-Type: application/json" -d "@auth.json"
try {
    $token = ($login_resp | ConvertFrom-Json).token
    if (-not $token) { throw "No token" }
    Write-Host "Token received"
}
catch {
    Write-Host "Login failed: $login_resp"
    Stop-Process -Id $serverProcess.Id
    Exit
}

# 3. Create Verification Script
Set-Content -Path "examples/check_metadata.rs" -Value @"
use dotenvy::dotenv;
use sqlx::sqlite::SqlitePoolOptions;
use std::env;

#[tokio::main]
async fn main() {
    dotenv().ok();
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = SqlitePoolOptions::new().connect(&db_url).await.unwrap();

    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        println!("Usage: check_metadata <file_id>");
        return;
    }
    let file_id = &args[1];

    let row = sqlx::query!("SELECT category, metadata FROM file_metadata WHERE storage_file_id = (SELECT storage_file_id FROM user_files WHERE id = ?)", file_id)
        .fetch_optional(&pool)
        .await
        .unwrap();

    if let Some(r) = row {
        println!("Category: {}", r.category);
        println!("Metadata: {}", r.metadata);
    } else {
        println!("No metadata found for file {}", file_id);
    }
}
"@

# 4. Loop through all files in scripts/test_metadata
Write-Host "`n--- 2. Testing All Files in scripts/test_metadata ---"

$testDir = "scripts/test_metadata"
if (-not (Test-Path $testDir)) {
    Write-Host "Directory $testDir does not exist!" -ForegroundColor Red
    Stop-Process -Id $serverProcess.Id
    Exit
}

$files = Get-ChildItem -Path $testDir -File
$uploadedFiles = @{}

foreach ($file in $files) {
    Write-Host "`nProcessing $($file.Name)..."
    
    # Determine basic mime for curl
    $mime = "application/octet-stream"
    switch -Wildcard ($file.Extension.ToLower()) {
        "*.jpg" { $mime = "image/jpeg" }
        "*.jpeg" { $mime = "image/jpeg" }
        "*.png" { $mime = "image/png" }
        "*.pdf" { $mime = "application/pdf" }
        "*.docx" { $mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
        "*.xlsx" { $mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
        "*.pptx" { $mime = "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
        "*.txt" { $mime = "text/plain" }
        "*.mp4" { $mime = "video/mp4" }
        "*.mp3" { $mime = "audio/mpeg" }
    }

    $filePath = $file.FullName
    # Escape path if needed or ensure it works with curl
    
    $upResp = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@$filePath;type=$mime"
    
    try {
        $json = $upResp | ConvertFrom-Json
        if ($json.file_id) {
            $uploadedFiles[$file.Name] = $json.file_id
            Write-Host "Uploaded $($file.Name) -> ID: $($json.file_id)" -ForegroundColor Green
        }
        else {
            Write-Host "Failed to upload $($file.Name). Response: $upResp" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "Exception uploading $($file.Name): $_" -ForegroundColor Red
    }
}

# 5. Verification Loop
Write-Host "`n--- 3. Verifying Metadata in DB ---"

foreach ($name in $uploadedFiles.Keys) {
    $id = $uploadedFiles[$name]
    Write-Host "`nChecking Metadata for: $name (ID: $id)"
    cargo run --quiet --example check_metadata -- $id
}

# Cleanup
Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
Remove-Item auth.json, examples/check_metadata.rs -ErrorAction SilentlyContinue
