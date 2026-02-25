@echo off
echo 📦 Building and starting services with Podman...
podman compose up --build -d
echo 🚀 Services are starting!
echo.
echo 🌐 Frontend: http://localhost
echo 📖 API/Swagger: http://localhost:3000/swagger-ui
echo 🪣 Minio Console: http://localhost:9001 (user: rustfsadmin, pass: rustfsadmin)
echo.
echo ℹ️  Use 'podman compose logs -f' to see logs.
pause
