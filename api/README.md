# 🦀 Rust File Backend: The Core Engine

The `api` directory contains the high-performance Rust backend that powers the RFB ecosystem. Built for speed, safety, and scalability.

---

## 🛠 Tech Stack

- **Axum**: An ergonomic and modular web framework built on top of `hyper`, `tokio`, and `tower`.
- **SeaORM**: An async ORM for Rust that provides a type-safe way to interact with databases.
- **Tokio**: The industry-standard asynchronous runtime for Rust.
- **AWS SDK for Rust**: High-performance S3 client for object storage.
- **SQLx**: Underlying database driver supporting PostgreSQL, MySQL, and SQLite.
- **Utoipa**: Automated OpenAPI/Swagger documentation generation.

---

## 🏗 Modular Design

The backend is designed to run in multiple modes, allowing you to scale the API and background workers independently.

### 1. API Mode (`--mode api`)
Handles all incoming HTTP requests, authentication, and file metadata management.
- JWT-based authentication.
- Metadata extraction (EXIF, Media info).
- Real-time search and filtering.

### 2. Worker Mode (`--mode worker`)
Processes background tasks out-of-band to keep the API responsive.
- Finalizing large multipart uploads.
- Running virus scans (ClamAV).
- Background file cleanup and expiration.
- Metadata indexing.

---

## 🔒 Security Architecture

Security is baked into the core:
1. **Deduplication Logic**: Files are hashed via **SHA-256/XXH3** before storing. Only unique blobs are saved to S3.
2. **Content Validation**: We use **Magic Bytes** to verify that file content matches the reported MIME type.
3. **Malware Scanning**: Integration with ClamAV stops malicious uploads in their tracks.
4. **Credential Safety**: Passwords hashed using **Argon2** (current OWASP recommendation).

---

## 🚀 Setting Up

### Prerequisites
- [Rust 1.84+](https://rustup.rs/)
- [PostgreSQL](https://www.postgresql.org/) (Recommended) or SQLite
- [MinIO](https://min.io/) (for local S3)

### Configuration
Edit `.env` to configure your database and storage:
```env
DATABASE_URL=postgres://user:pass@localhost/rfb
JWT_SECRET=super_secret_key
MINIO_ENDPOINT=http://localhost:9000
MINIO_BUCKET=uploads
CHUNK_SIZE=7340032 # 7MB
```

### Running
```bash
# Run API
cargo run --release -- --mode api --port 3000

# Run Worker
cargo run --release -- --mode worker
```

---

## 📖 Documentation
Once the API is running, visit `http://localhost:3000/swagger-ui` for the full interactive OpenAPI documentation.

---

## 📁 Source Overview
- `src/api/handlers`: HTTP route logic.
- `src/api/middleware`: Auth, Logging, and Rate-limiting.
- `src/services`: Core business logic (Storage, Uploads, Files).
- `src/entities`: Database models (SeaORM).
- `src/infrastructure`: Database and Storage service implementations.
