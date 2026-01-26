# Rust File Backend

A high-performance, thread-safe REST backend for file management with deduplication and expiration features.

## Features

- **JWT Authentication**: Secure user registration and login.
- **S3-Compatible Storage**: Integrated with MinIO/S3 using streaming multipart uploads.
- **File Deduplication**: SHA-256 based deduplication to save storage space.
- **Automatic Expiration**: Background worker to clean up expired files.
- **High Concurrency**: Optimized for 50,000+ concurrent connections using streaming and SQLite WAL mode.
- **API Documentation**: Built-in Swagger UI at `/swagger-ui`.

## Security Features

- **File Validation**: Strict allowlist (Docs, Media, Archives), magic bytes verification, filename sanitization.
- **Virus Scanning**: Integrated ClamAV scanning for all uploads.
- **Deduplication**: Hash-based deduplication with client-side pre-check support.
- **Rate Limiting**: IP and User-based rate limits.
- **Size Limits**: Enforced 256MB limit.

## Setup

1. **Prerequisites**:
   - Rust (latest stable)
   - MinIO or S3-compatible storage
   - SQLite

2. **Configuration**:
   Copy `.env.example` to `.env` and update the values:
   ```env
   DATABASE_URL=sqlite:backend.db
   JWT_SECRET=your_secret_key
   MINIO_ENDPOINT=http://127.0.0.1:9000
   MINIO_ACCESS_KEY=minioadmin
   MINIO_SECRET_KEY=minioadmin
   MINIO_BUCKET=uploads
   # Security
   MAX_FILE_SIZE=268435456
   UPLOADS_PER_HOUR=250
   ENABLE_VIRUS_SCAN=true
   CLAMAV_HOST=127.0.0.1
   CLAMAV_PORT=3310
   ```

3. **Run the application**:
   ```bash
   cargo run
   ```

4. **Run tests**:
   ```bash
   cargo test
   ```

## API Endpoints

- `POST /register`: Register a new user.
- `POST /login`: Login and receive a JWT token.
- `POST /upload`: Upload a file (requires JWT). Supports `expiration_hours` field.
- `GET /swagger-ui`: Interactive API documentation.

## Postman Collection

A Postman collection is provided in the root directory: `postman_collection.json`.
1. Import the file into Postman.
2. The `baseUrl` is set to `http://127.0.0.1:3000`.
3. Running the **Login** request will automatically save the JWT token to the collection variables for use in the **Upload** request.

## License

MIT
