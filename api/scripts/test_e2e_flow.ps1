$ErrorActionPreference = "Stop"

function Assert-Success {
    param (
        [string]$Output,
        [int]$Code,
        [string]$Message
    )
    if ($Code -lt 200 -or $Code -ge 300) {
        Write-Error "FAILED: $Message (Status: $Code). Output: $Output"
    }
    else {
        Write-Host "SUCCESS: $Message" -ForegroundColor Green
    }
}

$BaseUrl = "http://127.0.0.1:3000"
$Username = "testuser_" + [guid]::NewGuid().ToString()
$Password = "password123"

# Check curl
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    Write-Error "curl.exe not found. Please install curl."
    exit 1
}

Write-Host "--- 1. Register User ---"
$RegJson = @{
    username = $Username
    password = $Password
} | ConvertTo-Json -Compress
# Escape quotes for cmd line if necessary, but saving to file is safer
Set-Content -Path "register.json" -Value $RegJson

# curl -w "%{http_code}" prints status at the end. We capture it.
# We use a file for -d to avoid quote hell in PowerShell
$RegOut = curl.exe -s -w "%{http_code}" -X POST "$BaseUrl/register" -H "Content-Type: application/json" -d "@register.json"
$RegCode = [int]$RegOut.Substring($RegOut.Length - 3)
$RegBody = $RegOut.Substring(0, $RegOut.Length - 3)
Assert-Success $RegBody $RegCode "User Registration"

Write-Host "--- 2. Login ---"
$LoginOut = curl.exe -s -w "%{http_code}" -X POST "$BaseUrl/login" -H "Content-Type: application/json" -d "@register.json"
$LoginCode = [int]$LoginOut.Substring($LoginOut.Length - 3)
$LoginBody = $LoginOut.Substring(0, $LoginOut.Length - 3)
Assert-Success $LoginBody $LoginCode "Login"

$Token = ($LoginBody | ConvertFrom-Json).token
$AuthHeader = "Authorization: Bearer $Token"

Write-Host "--- 3. Upload Small File ---"
$SmallFile = "test_small.txt"
Set-Content -Path $SmallFile -Value "This is a small encrypted file."
$UploadOut = curl.exe -s -X POST "$BaseUrl/upload" -H "$AuthHeader" -H "Expect:" -F "file=@$SmallFile"
# If curl succeeds, it returns JSON. If fails (e.g. 500), it might return text.
# We assume success if we can parse the ID.
try {
    $SmallFileId = ($UploadOut | ConvertFrom-Json).file_id
    Write-Host "SUCCESS: Upload Small File (ID: $SmallFileId)" -ForegroundColor Green
}
catch {
    Write-Error "FAILED: Upload Small File. Output: $UploadOut"
}

Write-Host "--- 4. Large File Constraints ---"
# 4a. 100KB File
$Size100KB = 100 * 1024
$File100KB = "test_100kb.pdf"
$Content100KB = "B" * $Size100KB
Set-Content -Path $File100KB -Value $Content100KB
Write-Host "Uploading 100KB file..."
$Upload100Out = curl.exe -s -w "%{http_code}" -X POST "$BaseUrl/upload" -H "$AuthHeader" -H "Expect:" -F "file=@$File100KB"
if ($Upload100Out.Length -lt 3) {
    Write-Error "FAILED: 100KB Upload - Empty output"
}
$Upload100Code = [int]$Upload100Out.Substring($Upload100Out.Length - 3)
if ($Upload100Code -eq 200) {
    Write-Host "SUCCESS: 100KB Upload allowed" -ForegroundColor Green
}
else {
    Write-Error "FAILED: 100KB Upload rejected (Status: $Upload100Code). Output: $Upload100Out"
}

# 4b. 60MB File
$File60MB = "test_60mb.pdf"
# Create 60MB quickly (sparse is fine for rejection test)
fsutil file createnew $File60MB (60 * 1024 * 1024) | Out-Null
Write-Host "Uploading 60MB file..."
$Upload60Out = curl.exe -s -w "%{http_code}" -X POST "$BaseUrl/upload" -H "$AuthHeader" -H "Expect:" -F "file=@$File60MB"
$Upload60Code = [int]$Upload60Out.Substring($Upload60Out.Length - 3)

# 413 Payload Too Large is expected
if ($Upload60Code -eq 413 -or $Upload60Code -eq 400) {
    Write-Host "SUCCESS: 60MB Upload rejected (Status: $Upload60Code)" -ForegroundColor Green
}
else {
    Write-Error "FAILED: 60MB Upload Accepted or Unexpected Error (Status: $Upload60Code)"
}

# Clean
Remove-Item $File100KB, $File60MB, "register.json", $SmallFile, "test_49mb.bin", "test_51mb.bin" -ErrorAction SilentlyContinue

Write-Host "--- 5. Key Rotation Test ---"
Write-Host "Downloading Pre-Rotation..."
$Down1 = curl.exe -s -H "$AuthHeader" "$BaseUrl/files/$SmallFileId"
if ($Down1 -eq "This is a small encrypted file.") {
    Write-Host "SUCCESS: Content verified." -ForegroundColor Green
}
else {
    Write-Error "FAILED: Content mismatch. Got: $Down1"
}

Write-Host "Rotating Keys..."
$RotateOut = curl.exe -s -w "%{http_code}" -X POST "$BaseUrl/users/keys/rotate" -H "$AuthHeader" -H "Expect:" -H "Content-Length: 0"
$RotateCode = [int]$RotateOut.Substring($RotateOut.Length - 3)
Assert-Success $RotateOut $RotateCode "Key Rotation"

Write-Host "Downloading Post-Rotation..."
$Down2 = curl.exe -s -H "$AuthHeader" "$BaseUrl/files/$SmallFileId"
if ($Down2 -eq "This is a small encrypted file.") {
    Write-Host "SUCCESS: Content verified after rotation." -ForegroundColor Green
}
else {
    Write-Error "FAILED: Content mismatch post-rotation. Got: $Down2"
}

Write-Host "--- TEST COMPLETE ---"
