# test_e2e_curl.ps1

# 1. Setup
Write-Host "--- Setting up (Fast E2E with curl) ---"
Stop-Process -Name "rust-file-backend" -ErrorAction SilentlyContinue

# Add MinGW to PATH
$env:PATH = "D:\projects\mingw64\bin;" + $env:PATH

# Skip antivirus and limit file size to 50MB
$env:VIRUS_SCANNER_TYPE = "noop"
$env:ENABLE_VIRUS_SCAN = "false"
$env:MAX_FILE_SIZE = "52428800" # 50MB exactly
$env:RUST_LOG = "info"

$baseUrl = "http://127.0.0.1:3000"

# Reset Database for fresh run
if (Test-Path "backend.db") {
    Write-Host "Removing existing database backend.db"
    Remove-Item "backend.db" -Force
}
New-Item "backend.db" -ItemType File | Out-Null

# Start Server
Write-Host "Starting server..."
$serverProcess = Start-Process -FilePath "cargo" -ArgumentList "run" -PassThru -NoNewWindow
Write-Host "Server started with PID $($serverProcess.Id). Waiting for health check..."

$maxRetries = 30
$retryCount = 0
$healthy = $false

while (-not $healthy -and $retryCount -lt $maxRetries) {
    try {
        $resp = curl.exe -s -o NUL -w "%{http_code}" "$baseUrl/health"
        if ($resp -eq "200") {
            $healthy = $true
            Write-Host "Server is healthy!"
        } else {
            Write-Host "Waiting for server... (Attempt $retryCount/30, status: $resp)"
            Start-Sleep -Seconds 10
            $retryCount++
        }
    } catch {
        Write-Host "Waiting for server... (Attempt $retryCount/30, connection error)"
        Start-Sleep -Seconds 10
        $retryCount++
    }
}

if (-not $healthy) {
    Write-Host "Server failed to start in time."
    Stop-Process -Id $serverProcess.Id
    Exit 1
}

# Helper to create fake MP4
function New-FakeMP4 ($path, $sizeMB) {
    if (Test-Path $path) { Remove-Item $path }
    fsutil file createnew $path ($sizeMB * 1024 * 1024) | Out-Null
    $bytes = [byte[]] (0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70) # MP4 ftyp signature
    $fs = [System.IO.File]::OpenWrite($path)
    $fs.Write($bytes, 0, $bytes.Length)
    $fs.Close()
}

# Create Files
Write-Host "Creating test files..."
New-FakeMP4 "test_50mb.mp4" 50
New-FakeMP4 "test_60mb.mp4" 60 # To test the limit

Set-Content -Path "auth.json" -Value '{"username": "curluser", "password": "password123"}'
Set-Content -Path "folder.json" -Value '{"name": "TestFolder", "parent_id": null}'
Set-Content -Path "rename.json" -Value '{"name": "renamed_50mb.mp4"}'

# 2. Register & Login
Write-Host "`n--- 1. Authentication ---"
$reg = curl.exe -s -X POST "$baseUrl/register" -H "Content-Type: application/json" -d "@auth.json" -w "%{http_code}"
Write-Host "Register Status: $reg"

$login_resp = curl.exe -s -X POST "$baseUrl/login" -H "Content-Type: application/json" -d "@auth.json"
$token = ($login_resp | ConvertFrom-Json).token
if (-not $token) {
    Write-Host "Login failed. Response: $login_resp"
    Stop-Process -Id $serverProcess.Id
    Exit
}
Write-Host "Token received"

# 3. Uploads
Write-Host "`n--- 2. Uploads ---"

# 50MB (Should pass)
Write-Host "Uploading 50MB (Limit matches)..."
$up50 = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@test_50mb.mp4;type=video/mp4" -F "expiration_hours=24"
try {
    $id50 = ($up50 | ConvertFrom-Json).file_id
    if ($id50) {
        Write-Host "SUCCESS: 50MB Uploaded, ID: $id50"
    } else {
        Write-Host "FAIL: 50MB Upload failed. Response: $up50"
    }
}
catch {
    Write-Host "50MB Upload Error. Response: $up50"
}

# 60MB (Should fail due to limit)
Write-Host "Uploading 60MB (Expect 413 or 400)..."
$up60_code = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@test_60mb.mp4;type=video/mp4" -w "%{http_code}" -o NUL
Write-Host "60MB Response Code: $up60_code"
if ($up60_code -eq "413" -or $up60_code -eq "400") {
    Write-Host "SUCCESS: 60MB blocked as expected"
} else {
    Write-Host "FAIL: 60MB NOT blocked (Code: $up60_code)"
}

# 4. Folder & File Operations
Write-Host "`n--- 3. Folder & File Operations ---"

# Create Folder
Write-Host "Creating Folder 'TestFolder'..."
$folderResp = curl.exe -s -X POST "$baseUrl/folders" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "@folder.json"
try {
    $folderId = ($folderResp | ConvertFrom-Json).id
    if (-not $folderId) { $folderId = ($folderResp | ConvertFrom-Json).data.id }
    
    if ($folderId) { Write-Host "SUCCESS: Folder Created ID: $folderId" } else { Write-Host "FAIL: Folder creation failed. Response: $folderResp" }
}
catch {
    Write-Host "Folder Creation Failed. Response: $folderResp"
}

# Rename 50MB File
Write-Host "Renaming 50MB file to 'renamed_50mb.mp4'..."
$renameResp = curl.exe -s -X PUT "$baseUrl/files/$id50/rename" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "@rename.json"
Write-Host "Rename Response: $renameResp"

# 5. Download & Verification
Write-Host "`n--- 4. Download & Verification ---"

# Verify List contains Renamed File
Write-Host "Listing files..."
$filesResp = curl.exe -s -X GET "$baseUrl/files" -H "Authorization: Bearer $token"
$files = ($filesResp | ConvertFrom-Json)
$filesData = if ($files.data) { $files.data } else { $files }

$renamedFound = $filesData | Where-Object { $_.name -eq "renamed_50mb.mp4" }
if ($renamedFound) { Write-Host "SUCCESS: Renamed file found in list" } else { Write-Host "FAIL: Renamed file NOT found" }

# Download Renamed
if ($id50) {
    Write-Host "Downloading Renamed File ($id50)..."
    $outFile = "downloaded_renamed_50mb.mp4"
    curl.exe -s -X GET "$baseUrl/files/$id50" -H "Authorization: Bearer $token" -o $outFile
    if (Test-Path "test_50mb.mp4") {
        $origHash = Get-FileHash "test_50mb.mp4"
        $downHash = Get-FileHash $outFile
        if ($origHash.Hash -eq $downHash.Hash) { Write-Host "SUCCESS: Downloaded file matches original" } else { Write-Host "FAIL: Hash mismatch" }
    }
}

# 6. Verification Tool
Write-Host "`n--- 5. Final Verification ---"
cargo run --example verify_upload
if ($LASTEXITCODE -ne 0) {
    Write-Host "Verification tool failed!"
}

# Cleanup
Write-Host "`n--- Cleanup ---"
Stop-Process -Id $serverProcess.Id
Remove-Item test_50mb.mp4, test_60mb.mp4, downloaded_*.mp4, auth.json, folder.json, rename.json -ErrorAction SilentlyContinue

Write-Host "`n--- Test Complete ---"
