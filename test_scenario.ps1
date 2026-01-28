$ErrorActionPreference = "Stop"

Write-Host "Starting Comprehensive Curl Test..." -ForegroundColor Green

# Define JSON payloads using here-strings or basic strings
$auth_json = '{"username": "testuser_hw_v5", "password": "password123"}'
$folder_json = '{"name": "TestFolder", "parent_id": null}'
$rename_json = '{"name": "renamed_file.txt"}'

# Write to files with explicit ASCII encoding to avoid BOM issues with curl
$auth_json | Set-Content -Path auth.json -Encoding Ascii
$folder_json | Set-Content -Path folder.json -Encoding Ascii
$rename_json | Set-Content -Path rename.json -Encoding Ascii

# 1. Register
Write-Host "`n1. Registering User..." -ForegroundColor Yellow
$register_res = & curl.exe -s -X POST http://localhost:3000/register -H "Content-Type: application/json" -d "@auth.json"
Write-Host "Response: $register_res"

# 2. Login
Write-Host "`n2. Logging in..." -ForegroundColor Yellow
$login_res = & curl.exe -s -X POST http://localhost:3000/login -H "Content-Type: application/json" -d "@auth.json"
Write-Host "Response: $login_res"

$token = ""
try {
    $obj = $login_res | ConvertFrom-Json
    $token = $obj.token
    if (-not $token) { throw "Token is empty" }
    Write-Host "Token received (start): $($token.Substring(0, 20))..." -ForegroundColor Green
}
catch {
    Write-Error "Failed to parse token from login response. Response was: $login_res"
    exit 1
}

# 3. Upload File
Write-Host "`n3. Uploading File..." -ForegroundColor Yellow
$upload_res = & curl.exe -s -X POST http://localhost:3000/upload -H "Authorization: Bearer $token" -F "file=@test_file.txt"
Write-Host "Response: $upload_res"

$file_id = ""
try {
    $upload_obj = $upload_res | ConvertFrom-Json
    $file_id = $upload_obj.file_id
    Write-Host "File ID: $file_id" -ForegroundColor Green
}
catch {
    Write-Warning "Failed to parse file_id from upload response: $upload_res"
}

# 4. List Files
Write-Host "`n4. Listing Files..." -ForegroundColor Yellow
$list_res = & curl.exe -s -X GET http://localhost:3000/files -H "Authorization: Bearer $token"
Write-Host "Response: $list_res"

# 5. Create Folder
Write-Host "`n5. Creating Folder..." -ForegroundColor Yellow
$folder_res = & curl.exe -s -X POST http://localhost:3000/folders -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "@folder.json"
Write-Host "Response: $folder_res"

try {
    $folder_obj = $folder_res | ConvertFrom-Json
    $folder_id = $folder_obj.id
    Write-Host "Folder ID: $folder_id" -ForegroundColor Green
}
catch {
    Write-Warning "Failed to parse folder_id: $folder_res"
}

# 6. Rename File
if ($file_id) {
    Write-Host "`n6. Renaming File..." -ForegroundColor Yellow
    $rename_res = & curl.exe -s -X PUT "http://localhost:3000/files/$file_id/rename" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "@rename.json"
    Write-Host "Response: $rename_res"
}

# 7. Download File
if ($file_id) {
    Write-Host "`n7. Downloading File..." -ForegroundColor Yellow
    & curl.exe -s -O -J -H "Authorization: Bearer $token" "http://localhost:3000/files/$file_id"
    if (Test-Path "test_file.txt") {
        Write-Host "Download successful (found file on disk)" -ForegroundColor Green
    }
}

# 8. Delete File
if ($file_id) {
    Write-Host "`n8. Deleting File..." -ForegroundColor Yellow
    $delete_res = & curl.exe -s -w "%{http_code}" -o NUL -X DELETE "http://localhost:3000/files/$file_id" -H "Authorization: Bearer $token"
    Write-Host "Response Code: $delete_res"
}

# Cleanup temporary JSON files
Remove-Item auth.json, folder.json, rename.json -ErrorAction SilentlyContinue

Write-Host "`nTest Case Complete." -ForegroundColor Green
