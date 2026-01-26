# test_full_flow.ps1

# 1. Setup
Write-Host "--- Setting up ---"
Stop-Process -Name "rust-file-backend" -ErrorAction SilentlyContinue
$env:VIRUS_SCANNER_TYPE = "noop"
$env:RUST_LOG = "info"
$env:MAX_FILE_SIZE = "419430400" # 400MB

# Start Server
Write-Host "Starting server..."
$serverProcess = Start-Process -FilePath "cargo" -ArgumentList "run" -PassThru -NoNewWindow
Write-Host "Server started with PID $($serverProcess.Id). Waiting 30s..."
Start-Sleep -Seconds 30

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
New-FakeMP4 "test_200mb.mp4" 200
New-FakeMP4 "test_300mb.mp4" 300

Set-Content -Path "eicar.txt" -Value "X5O!P%@AP[4\PZX54(P^)7CC)7}`$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$`$H+H*"
Set-Content -Path "malware.exe" -Value "MZ..."
Set-Content -Path "auth.json" -Value '{"username": "curluser", "password": "password123"}'

# 2. Register & Login
Write-Host "`n--- 1. Authentication ---"
$reg = curl.exe -s -X POST http://localhost:3000/register -H "Content-Type: application/json" -d "@auth.json" -w "%{http_code}"
Write-Host "Register Status: $reg"

$login_resp = curl.exe -s -X POST http://localhost:3000/login -H "Content-Type: application/json" -d "@auth.json"
$token = ($login_resp | ConvertFrom-Json).token
if (-not $token) {
    Write-Host "Login failed. Response: $login_resp"
    Stop-Process -Id $serverProcess.Id
    Exit
}
Write-Host "Token received"

# 3. Uploads
Write-Host "`n--- 2. Uploads ---"

# 50MB
Write-Host "Uploading 50MB..."
$up50 = curl.exe -s -X POST http://localhost:3000/upload -H "Authorization: Bearer $token" -F "file=@test_50mb.mp4;type=video/mp4"
try {
    $id50 = ($up50 | ConvertFrom-Json).file_id
    Write-Host "50MB ID: $id50"
}
catch {
    Write-Host "50MB Upload Failed. Response: $up50"
}

# 200MB
Write-Host "Uploading 200MB..."
$up200 = curl.exe -s -X POST http://localhost:3000/upload -H "Authorization: Bearer $token" -F "file=@test_200mb.mp4;type=video/mp4"
try {
    $id200 = ($up200 | ConvertFrom-Json).file_id
    Write-Host "200MB ID: $id200"
}
catch {
    Write-Host "200MB Upload Failed. Response: $up200"
}

# 300MB
Write-Host "Uploading 300MB..."
$up300 = curl.exe -s -X POST http://localhost:3000/upload -H "Authorization: Bearer $token" -F "file=@test_300mb.mp4;type=video/mp4"
try {
    $id300 = ($up300 | ConvertFrom-Json).file_id
    Write-Host "300MB ID: $id300"
}
catch {
    Write-Host "300MB Upload Failed. Response: $up300"
}

# Dedup (50MB again)
Write-Host "Uploading 50MB again (Dedup)..."
$up50d = curl.exe -s -X POST http://localhost:3000/upload -H "Authorization: Bearer $token" -F "file=@test_50mb.mp4;type=video/mp4"
try {
    $id50d = ($up50d | ConvertFrom-Json).file_id
    Write-Host "50MB Dedup ID: $id50d"
    if ($id50 -ne $id50d) { Write-Host "SUCCESS: File IDs are different (UserFile created)" } else { Write-Host "FAIL: File IDs are same" }
}
catch {
    Write-Host "Dedup Upload Failed. Response: $up50d"
}

# 4. Security Tests
Write-Host "`n--- 3. Security Tests ---"

# EICAR
Write-Host "Uploading EICAR (Expect Success with NoOp)..."
$eicar = curl.exe -s -X POST http://localhost:3000/upload -H "Authorization: Bearer $token" -F "file=@eicar.txt"
try {
    $eicar_id = ($eicar | ConvertFrom-Json).file_id
    if ($eicar_id) { Write-Host "SUCCESS: EICAR uploaded" } else { Write-Host "FAIL: EICAR upload failed" }
}
catch {
    Write-Host "EICAR Upload Failed. Response: $eicar"
}

# File Type (.exe)
Write-Host "Uploading .exe (Expect 400)..."
$exe_code = curl.exe -s -X POST http://localhost:3000/upload -H "Authorization: Bearer $token" -F "file=@malware.exe" -w "%{http_code}" -o NUL
Write-Host "EXE Response Code: $exe_code"
if ($exe_code -eq "400") { Write-Host "SUCCESS: .exe blocked" } else { Write-Host "FAIL: .exe not blocked" }

# 5. Download
Write-Host "`n--- 4. Download ---"
if ($id50) {
    Write-Host "Downloading 50MB file..."
    curl.exe -s -X GET "http://localhost:3000/files/$id50" -H "Authorization: Bearer $token" -o downloaded_50mb.mp4
    $origHash = Get-FileHash test_50mb.mp4
    $downHash = Get-FileHash downloaded_50mb.mp4
    if ($origHash.Hash -eq $downHash.Hash) { Write-Host "SUCCESS: Downloaded file matches original" } else { Write-Host "FAIL: Hash mismatch" }
}
else {
    Write-Host "Skipping download test (upload failed)"
}

# 6. Verification
Write-Host "`n--- 5. Verification (DB & S3) ---"
cargo run --example verify_upload
if ($LASTEXITCODE -ne 0) {
    Write-Host "Verification failed!"
}

# Cleanup
Write-Host "`n--- Cleanup ---"
Stop-Process -Id $serverProcess.Id
Remove-Item test_50mb.mp4, test_200mb.mp4, test_300mb.mp4, eicar.txt, malware.exe, downloaded_50mb.mp4, auth.json -ErrorAction SilentlyContinue
