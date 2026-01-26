# Rust File Backend (Beta 3)

A high-performance, thread-safe REST backend for file management with deduplication, expiration, and large file support.

## Features

- **JWT Authentication**: Secure user registration and login.
- **S3-Compatible Storage**: Integrated with MinIO/S3 using streaming multipart uploads.
- **Database Support**: PostgreSQL (Default) and SQLite support via SeaORM.
- **File Deduplication**: SHA-256 based deduplication to save storage space (Single storage, multiple references).
- **Large File Support**: Capable of handling uploads up to **1GB** using streaming to keep memory usage low.
- **Automatic Expiration**: Background worker to clean up expired files from DB and S3.
- **High Concurrency**: Optimized for 50,000+ concurrent connections.
- **API Documentation**: Built-in Swagger UI at `/swagger-ui`.

## Security Features

- **File Validation**: Strict allowlist (Docs, Media, Archives), magic bytes verification, filename sanitization.
- **Virus Scanning**: Integrated ClamAV scanning for all uploads.
- **Deduplication**: Hash-based deduplication with client-side pre-check support.
- **Rate Limiting**: IP and User-based rate limits.
- **Size Limits**: Enforced 1GB limit (Configurable).

## Setup

1. **Prerequisites**:
   - Rust (latest stable)
   - MinIO or S3-compatible storage
   - PostgreSQL (Recommended) or SQLite

2. **Configuration**:
   Copy `.env.example` to `.env` and update the values:
   ```env
   # PostgreSQL
   DATABASE_URL=postgres://filebackend:filebackend@127.0.0.1:5432/filebackend
   
   # Or SQLite
   # DATABASE_URL=sqlite:backend.db

   JWT_SECRET=your_secret_key
   MINIO_ENDPOINT=http://127.0.0.1:9000
   MINIO_ACCESS_KEY=minioadmin
   MINIO_SECRET_KEY=minioadmin
   MINIO_BUCKET=uploads
   # Security
   MAX_FILE_SIZE=1073741824 # 1GB
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
   # Run all tests
   cargo test
   
   # Run specific large file validation (Requires MinIO)
   cargo test --test large_upload_test
   ```

## API Endpoints

- `POST /register`: Register a new user.
- `POST /login`: Login and receive a JWT token.
- `POST /upload`: Upload a file (requires JWT). Supports `expiration_hours` field.
- `POST /pre-check`: Check if file already exists (deduplication) before upload.
- `GET /swagger-ui`: Interactive API documentation.

## Verification

An example script is included to verify uploads in both the internal Database and MinIO:

```bash
cargo run --example verify_upload
```

## Postman Collection

A Postman collection is provided in the root directory: `postman_collection.json`.
1. Import the file into Postman.
2. The `baseUrl` is set to `http://127.0.0.1:3000`.
3. Running the **Login** request will automatically save the JWT token to the collection variables for use in the **Upload** request.

## License

MIT
