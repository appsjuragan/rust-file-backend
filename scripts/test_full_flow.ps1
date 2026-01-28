# test_full_flow.ps1

# 1. Setup
Write-Host "--- Setting up ---"
Stop-Process -Name "rust-file-backend" -ErrorAction SilentlyContinue
$env:VIRUS_SCANNER_TYPE = "noop"
$env:RUST_LOG = "info"
$env:MAX_FILE_SIZE = "419430400" # 400MB

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
Set-Content -Path "folder.json" -Value '{"name": "TestFolder", "parent_id": null}'
Set-Content -Path "rename.json" -Value '{"name": "renamed_300mb.mp4"}'

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

# 50MB
Write-Host "Uploading 50MB..."
$up50 = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@test_50mb.mp4;type=video/mp4" -F "expiration_hours=24"
try {
    $id50 = ($up50 | ConvertFrom-Json).file_id
    Write-Host "50MB ID: $id50"
}
catch {
    Write-Host "50MB Upload Failed. Response: $up50"
}

# 200MB
Write-Host "Uploading 200MB..."
$up200 = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@test_200mb.mp4;type=video/mp4"
try {
    $id200 = ($up200 | ConvertFrom-Json).file_id
    Write-Host "200MB ID: $id200"
}
catch {
    Write-Host "200MB Upload Failed. Response: $up200"
}

# 300MB
Write-Host "Uploading 300MB..."
$up300 = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@test_300mb.mp4;type=video/mp4"
try {
    $id300 = ($up300 | ConvertFrom-Json).file_id
    Write-Host "300MB ID: $id300"
}
catch {
    Write-Host "300MB Upload Failed. Response: $up300"
}

# Dedup (50MB again)
Write-Host "Uploading 50MB again (Dedup)..."
$up50d = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@test_50mb.mp4;type=video/mp4"
try {
    $id50d = ($up50d | ConvertFrom-Json).file_id
    Write-Host "50MB Dedup ID: $id50d"
    if ($id50 -ne $id50d) { Write-Host "SUCCESS: File IDs are different (UserFile created)" } else { Write-Host "FAIL: File IDs are same" }
}
catch {
    Write-Host "Dedup Upload Failed. Response: $up50d"
}

# 4. Folder & File Operations
Write-Host "`n--- 3. Folder & File Operations ---"

# Create Folder
Write-Host "Creating Folder 'TestFolder'..."
$folderResp = curl.exe -s -X POST "$baseUrl/folders" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "@folder.json"
try {
    $folderId = ($folderResp | ConvertFrom-Json).id
    # Handle response format differences if any
    if (-not $folderId) { $folderId = ($folderResp | ConvertFrom-Json).data.id }
    
    if ($folderId) { Write-Host "SUCCESS: Folder Created ID: $folderId" } else { Write-Host "FAIL: Folder creation failed. Response: $folderResp" }
}
catch {
    Write-Host "Folder Creation Failed. Response: $folderResp"
}

# Rename 300MB File
Write-Host "Renaming 300MB file to 'renamed_300mb.mp4'..."
$renameResp = curl.exe -s -X PUT "$baseUrl/files/$id300/rename" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "@rename.json"
Write-Host "Rename Response: $renameResp"

# Delete 200MB File
Write-Host "Deleting 200MB file ($id200)..."
$delResp = curl.exe -s -X DELETE "$baseUrl/files/$id200" -H "Authorization: Bearer $token" -w "%{http_code}" -o NUL
if ($delResp -eq "204" -or $delResp -eq "200") { Write-Host "SUCCESS: 200MB file deleted (Code: $delResp)" } else { Write-Host "FAIL: Delete failed code $delResp" }

# Delete Original 50MB (Testing Dedup Cleanup)
Write-Host "Deleting Original 50MB file ($id50) - Dedup test..."
$del50Resp = curl.exe -s -X DELETE "$baseUrl/files/$id50" -H "Authorization: Bearer $token" -w "%{http_code}" -o NUL
if ($del50Resp -eq "204" -or $del50Resp -eq "200") { Write-Host "SUCCESS: Original 50MB file deleted" } else { Write-Host "FAIL: Delete 50MB failed code $del50Resp" }

# 5. Security Tests
Write-Host "`n--- 4. Security Tests ---"

# EICAR (SKIPPED due to local AV)
Write-Host "Skipping EICAR upload test..."
# $eicar = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@eicar.txt"
# try {
#     $eicar_id = ($eicar | ConvertFrom-Json).file_id
#     if ($eicar_id) { Write-Host "SUCCESS: EICAR uploaded" } else { Write-Host "FAIL: EICAR upload failed" }
# }
# catch {
#     Write-Host "EICAR Upload Failed. Response: $eicar"
# }

# File Type (.exe)
Write-Host "Uploading .exe (Expect 400)..."
$exe_code = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@malware.exe" -w "%{http_code}" -o NUL
Write-Host "EXE Response Code: $exe_code"
if ($exe_code -eq "400") { Write-Host "SUCCESS: .exe blocked" } else { Write-Host "FAIL: .exe not blocked" }

# 6. Download & Verification
Write-Host "`n--- 5. Download & Verification ---"

# Verify List contains Renamed File and NOT Deleted File
Write-Host "Listing files..."
$filesResp = curl.exe -s -X GET "$baseUrl/files" -H "Authorization: Bearer $token"
$files = ($filesResp | ConvertFrom-Json)
$filesData = if ($files.data) { $files.data } else { $files } # Handle potential data wrapper

# Check for renamed file
$renamedFound = $filesData | Where-Object { $_.name -eq "renamed_300mb.mp4" }
if ($renamedFound) { Write-Host "SUCCESS: Renamed file found in list" } else { Write-Host "FAIL: Renamed file NOT found" }

# Check for deleted 200MB file
$deletedFound = $filesData | Where-Object { $_.id -eq $id200 }
if (-not $deletedFound) { Write-Host "SUCCESS: Deleted 200MB file NOT in list" } else { Write-Host "FAIL: Deleted file STILL in list" }

# Helper to verify download
function Verify-Download ($id, $filename, $expectedLabel) {
    if ($id) {
        Write-Host "Downloading $expectedLabel ($id)..."
        $outFile = "downloaded_$filename"
        curl.exe -s -X GET "$baseUrl/files/$id" -H "Authorization: Bearer $token" -o $outFile
        if (Test-Path $filename) {
            $origHash = Get-FileHash $filename
            $downHash = Get-FileHash $outFile
            if ($origHash.Hash -eq $downHash.Hash) { Write-Host "SUCCESS: $expectedLabel matches original" } else { Write-Host "FAIL: $expectedLabel Hash mismatch" }
        }
        else {
            Write-Host "SKIP: Original file needed for hash check missing: $filename"
        }
    }
    else {
        Write-Host "SKIP: Download $expectedLabel (Missing ID)"
    }
}

# Download Dedup Copy (id50d) -> Should still work despite id50 deletion if soft delete or ref count works
Verify-Download $id50d "test_50mb.mp4" "Dedup Copy"

# Download Renamed (id300)
Verify-Download $id300 "test_300mb.mp4" "Renamed File"

# 7. Verification Tool
Write-Host "`n--- 6. Verification (DB & S3) ---"
cargo run --example verify_upload
if ($LASTEXITCODE -ne 0) {
    Write-Host "Verification failed!"
}

# Cleanup
Write-Host "`n--- Cleanup ---"
Stop-Process -Id $serverProcess.Id
Remove-Item test_50mb.mp4, test_200mb.mp4, test_300mb.mp4, eicar.txt, malware.exe, downloaded_*.mp4, auth.json, folder.json, rename.json -ErrorAction SilentlyContinue
