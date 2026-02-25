@echo off
set "PATH=%PATH%;%USERPROFILE%\.bun\bin;D:\projects\mingw64\bin"
set "LIBRARY_PATH=D:\projects\mingw64\x86_64-w64-mingw32\lib"

echo 🔍 Checking for running services...
taskkill /F /IM rust-file-backend.exe /T >nul 2>&1
taskkill /F /IM bun.exe /T >nul 2>&1
echo 🐳 Stopping running Nginx container...
docker kill rust-file-nginx >nul 2>&1
docker rm rust-file-nginx >nul 2>&1

echo 🚀 Starting Rust File Backend (API Service)...
:: Set environment variables for MinGW64 and start cargo in API mode
start "Backend API" cmd /k "cd api && set \"CC=gcc\" && set \"CXX=g++\" && cargo run --release --bin rust-file-backend -- --mode api --port 3000"

echo 👷 Starting Rust File Backend (Worker Service)...
start "Backend Worker" cmd /k "cd api && set \"CC=gcc\" && set \"CXX=g++\" && cargo run --release --bin rust-file-backend -- --mode worker"

echo 🌐 Starting React Frontend...
echo 🐳 Starting Nginx Container...
start "Nginx" cmd /k "docker-compose -f docker-compose.nginx.yml up"
cd web
:: Simple check to ensure dependencies are installed
if not exist node_modules (
    echo 📦 Installing frontend dependencies...
    bun install
)
start "Frontend" cmd /k "bun run dev"

echo.
echo ✅ services have been restarted in separate windows.
echo API:     http://127.0.0.1:3000
echo Worker:  Background Service
echo Frontend: http://localhost:5173
echo Nginx:    http://localhost:80
echo.
pause
