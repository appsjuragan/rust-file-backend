# test_swagger_endpoints.ps1
$baseUrl = "http://localhost:3000"
$testUsername = "testuser_$(Get-Random)"
$testPassword = "TestPassword123!"
$token = ""

$ProgressPreference = 'SilentlyContinue'

function Write-Step($msg) {
    Write-Host "`n>> $msg" -ForegroundColor Cyan
}

function Assert-Status($response, $expected, $msg) {
    if ($response.StatusCode -eq $expected) {
        Write-Host " [PASS] $msg" -ForegroundColor Green
    }
    else {
        Write-Host " [FAIL] $msg (Expected $expected, Got $($response.StatusCode))" -ForegroundColor Red
        if ($response.Content) {
            Write-Host " Response: $($response.Content)" -ForegroundColor Gray
        }
    }
}

# 1. Health Check
Write-Step "Testing /health..."
$health = Invoke-WebRequest -Uri "$baseUrl/health" -Method Get -UseBasicParsing
Assert-Status $health 200 "Health check"

# 2. Auth: Register
Write-Step "Testing /register..."
$regBody = @{ username = $testUsername; password = $testPassword } | ConvertTo-Json
$reg = Invoke-WebRequest -Uri "$baseUrl/register" -Method Post -Body $regBody -ContentType "application/json" -UseBasicParsing
Assert-Status $reg 201 "User registration"

# 2b. Auth: Register (Duplicate - Negative)
Write-Step "Testing /register (Duplicate)..."
try {
    Invoke-WebRequest -Uri "$baseUrl/register" -Method Post -Body $regBody -ContentType "application/json" -ErrorAction Stop -UseBasicParsing
    Write-Host " [FAIL] Duplicate registration should have failed" -ForegroundColor Red
}
catch {
    Assert-Status $_.Exception.Response 400 "Duplicate registration caught"
}

# 3. Auth: Login
Write-Step "Testing /login..."
$login = Invoke-RestMethod -Uri "$baseUrl/login" -Method Post -Body $regBody -ContentType "application/json"
$token = $login.token
if ($token) {
    Write-Host " [PASS] Login successful" -ForegroundColor Green
}
else {
    Write-Host " [FAIL] Login failed" -ForegroundColor Red
    exit 1
}

# 3b. Auth: Login (Invalid Password - Negative)
Write-Step "Testing /login (Invalid Password)..."
try {
    $badLoginBody = @{ username = $testUsername; password = "WrongPassword" } | ConvertTo-Json
    Invoke-WebRequest -Uri "$baseUrl/login" -Method Post -Body $badLoginBody -ContentType "application/json" -ErrorAction Stop -UseBasicParsing
    Write-Host " [FAIL] Invalid login should have failed" -ForegroundColor Red
}
catch {
    Assert-Status $_.Exception.Response 401 "Invalid login caught"
}

$headers = @{ Authorization = "Bearer $token" }

# 3c. Unauthorized Access (Negative)
Write-Step "Testing /settings (No Token)..."
try {
    Invoke-WebRequest -Uri "$baseUrl/settings" -Method Get -ErrorAction Stop -UseBasicParsing
    Write-Host " [FAIL] Access without token should have failed" -ForegroundColor Red
}
catch {
    Assert-Status $_.Exception.Response 401 "Unauthorized access caught"
}

# 4. User Profile
Write-Step "Testing /users/me (GET/PUT)..."
$userProfile = Invoke-RestMethod -Uri "$baseUrl/users/me" -Method Get -Headers $headers
Write-Host " Current profile: $($userProfile.username)"
$updateProfileBody = @{ name = "Test User Full Name" } | ConvertTo-Json
$updateProfile = Invoke-WebRequest -Uri "$baseUrl/users/me" -Method Put -Headers $headers -Body $updateProfileBody -ContentType "application/json" -UseBasicParsing
Assert-Status $updateProfile 200 "Update profile"

# 5. User Settings
Write-Step "Testing /settings (GET/PUT)..."
$settings = Invoke-RestMethod -Uri "$baseUrl/settings" -Method Get -Headers $headers
Write-Host " Current theme: $($settings.theme)"
$updateSettingsBody = @{ theme = "dark" } | ConvertTo-Json
$updateSettings = Invoke-WebRequest -Uri "$baseUrl/settings" -Method Put -Headers $headers -Body $updateSettingsBody -ContentType "application/json" -UseBasicParsing
Assert-Status $updateSettings 200 "Update settings"

# 6. Folders
Write-Step "Testing /folders (POST)..."
$folderBody = @{ name = "Test Folder"; parent_id = $null } | ConvertTo-Json
$folder = Invoke-RestMethod -Uri "$baseUrl/folders" -Method Post -Headers $headers -Body $folderBody -ContentType "application/json"
$folderId = $folder.id
Write-Host " Created Folder ID: $folderId"
if ($folderId) {
    Write-Step " Testing /files/:id/path (GET) with folder..."
    $path = Invoke-RestMethod -Uri "$baseUrl/files/$folderId/path" -Method Get -Headers $headers
    if ($path) { Write-Host " [PASS] Get folder path" -ForegroundColor Green }
}

# 7. Upload File
Write-Step "Testing /upload (POST)..."
Set-Content -Path "test_file.txt" -Value "This is a test file content for Swagger endpoint testing. $(Get-Random)" -Encoding Ascii
$upload = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@test_file.txt" -F "parent_id=$folderId"
$uploadObj = $upload | ConvertFrom-Json
$fileId = $uploadObj.file_id
Write-Host " Uploaded File ID: $fileId"
if ($fileId) { Write-Host " [PASS] File upload" -ForegroundColor Green }

# 8. List Files
Write-Step "Testing /files (GET)..."
$files = Invoke-RestMethod -Uri "$baseUrl/files?parent_id=$folderId" -Method Get -Headers $headers
Write-Host " [PASS] List files (Found $($files.Count) items)" -ForegroundColor Green

# 9. Rename Item
Write-Step "Testing /files/:id/rename (PUT)..."
$renameBody = @{ name = "renamed_test_file.txt" } | ConvertTo-Json
$rename = Invoke-WebRequest -Uri "$baseUrl/files/$fileId/rename" -Method Put -Headers $headers -Body $renameBody -ContentType "application/json" -UseBasicParsing
Assert-Status $rename 200 "Rename file"

# 10. ZIP Contents
Write-Step "Testing /files/:id/zip-contents (GET)..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path "test.zip") { Remove-Item "test.zip" }
$zip = [System.IO.Compression.ZipFile]::Open("test.zip", "Create")
$zip.CreateEntry("internal.txt") | Out-Null
$zip.Dispose()
$uploadZip = curl.exe -s -X POST "$baseUrl/upload" -H "Authorization: Bearer $token" -F "file=@test.zip"
$zipObj = $uploadZip | ConvertFrom-Json
$zipId = $zipObj.file_id
if ($zipId) {
    $zipContents = Invoke-RestMethod -Uri "$baseUrl/files/$zipId/zip-contents" -Method Get -Headers $headers
    if ($zipContents.Count -ge 1) { Write-Host " [PASS] Get ZIP contents" -ForegroundColor Green }
}

# 11. Pre-check Dedup & Link
Write-Step "Testing /pre-check and /files/link (POST)..."
$fileHash = (Get-FileHash "test_file.txt" -Algorithm SHA256).Hash.ToLower()
$fileSize = (Get-Item "test_file.txt").Length
Write-Host " File Info: Hash=$fileHash, Size=$fileSize"
$preCheckBody = @{ full_hash = $fileHash; size = $fileSize } | ConvertTo-Json
$preCheck = Invoke-RestMethod -Uri "$baseUrl/pre-check" -Method Post -Headers $headers -Body $preCheckBody -ContentType "application/json"
$linkId = $null
if ($preCheck.exists) {
    Write-Host " [PASS] Pre-check (File exists)" -ForegroundColor Green
    $linkBody = @{ storage_file_id = $preCheck.file_id; filename = "linked_file.txt"; parent_id = $null } | ConvertTo-Json
    $link = Invoke-RestMethod -Uri "$baseUrl/files/link" -Method Post -Headers $headers -Body $linkBody -ContentType "application/json"
    $linkId = $link.file_id
    if ($linkId) { Write-Host " [PASS] Link file" -ForegroundColor Green }
}
else {
    Write-Host " [WARN] Pre-check: File NOT found in storage" -ForegroundColor Yellow
}

# 12. Bulk Move
Write-Step "Testing /files/bulk-move (POST)..."
$targetFolder = Invoke-RestMethod -Uri "$baseUrl/folders" -Method Post -Headers $headers -Body (@{ name = "Target Folder" } | ConvertTo-Json) -ContentType "application/json"
$targetId = $targetFolder.id
$moveBody = @{ item_ids = @($fileId, $zipId); parent_id = $targetId } | ConvertTo-Json
$move = Invoke-WebRequest -Uri "$baseUrl/files/bulk-move" -Method Post -Headers $headers -Body $moveBody -ContentType "application/json" -UseBasicParsing
Assert-Status $move 200 "Bulk move items"

# 13. Avatar
Write-Step "Testing /users/me/avatar (POST/GET)..."
Set-Content -Path "test_avatar.png" -Value "Fake PNG content" -Encoding Ascii
$uploadAvatar = curl.exe -s -X POST "$baseUrl/users/me/avatar" -H "Authorization: Bearer $token" -F "file=@test_avatar.png"
Write-Host " Upload Avatar Response: $uploadAvatar"
if ($uploadAvatar -match "url") {
    Write-Host " [PASS] Upload avatar" -ForegroundColor Green
    $getAvatar = Invoke-WebRequest -Uri "$baseUrl/users/me/avatar" -Method Get -Headers $headers -UseBasicParsing
    Assert-Status $getAvatar 200 "Get avatar"
}

# 14. Facts
Write-Step "Testing /users/me/facts (GET)..."
$facts = Invoke-RestMethod -Uri "$baseUrl/users/me/facts" -Method Get -Headers $headers
if ($facts) { Write-Host " [PASS] Get user facts" -ForegroundColor Green }

# 15. Bulk Delete
Write-Step "Testing /files/bulk-delete (POST)..."
$itemsToDelete = New-Object System.Collections.Generic.List[string]
$itemsToDelete.Add($targetId)
$itemsToDelete.Add($folderId)
if ($linkId) { $itemsToDelete.Add($linkId) }
$deleteBody = @{ item_ids = $itemsToDelete } | ConvertTo-Json
$delete = Invoke-WebRequest -Uri "$baseUrl/files/bulk-delete" -Method Post -Headers $headers -Body $deleteBody -ContentType "application/json" -UseBasicParsing
Assert-Status $delete 200 "Bulk delete items"

# 16. Final checks
Write-Step "Testing /files/:id (GET) download deleted file..."
try {
    Invoke-WebRequest -Uri "$baseUrl/files/$fileId" -Method Get -Headers $headers -ErrorAction Stop -UseBasicParsing
    Write-Host " [FAIL] Download deleted file should have failed" -ForegroundColor Red
}
catch {
    Write-Host " [PASS] Download deleted file failed as expected" -ForegroundColor Green
}

Write-Host "`n--- ALL SWAGGER ENDPOINT TESTS COMPLETED ---" -ForegroundColor Cyan
Remove-Item test_file.txt, test.zip, test_avatar.png -ErrorAction SilentlyContinue
