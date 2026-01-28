@echo off
set "PATH=%PATH%;C:\Users\Administrator\.bun\bin"

echo � Checking for running services...
taskkill /F /IM rust-file-backend.exe /T >nul 2>&1
taskkill /F /IM bun.exe /T >nul 2>&1

echo �🚀 Starting Rust File Backend...
start "Backend" cmd /k "cargo run"

echo 🌐 Starting React Frontend...
cd web
start "Frontend" cmd /k "bun run dev"

echo.
echo ✅ Both services have been restarted in separate windows.
echo Backend: http://127.0.0.1:3000
echo Frontend: http://localhost:5173
echo.
pause
