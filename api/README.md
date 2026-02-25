# 🦀 Rust File Backend API (v1.1.0)

The backend API is a high-performance Rust service built with **Axum**, **SeaORM**, and **Tokio**. It provides secure file management with deduplication, chunked uploads, virus scanning, file sharing, thumbnail generation, and S3-compatible storage.

---

## 🛠 Technology Stack

- **Web Framework:** Axum 0.7 (built on hyper, tokio, tower)
- **ORM:** SeaORM 1.1 (async, type-safe database access)
- **Runtime:** Tokio (async/await)
- **Storage:** AWS SDK for Rust (S3-compatible: RustFS, MinIO, AWS S3)
- **Database:** PostgreSQL 14+ (SQLite supported for development)
- **Security:** JWT, Argon2, ClamAV, CAPTCHA
- **Documentation:** Utoipa (OpenAPI/Swagger)
- **Thumbnail Tools:** `pdftocairo` (PDF), `ffmpeg` (video), `image` crate (images)

---

## 🏗 Architecture

### Tri-Mode Operation

The backend runs in three independent modes for horizontal scalability:

#### 1. **API Mode** (`--mode api`)
Handles all HTTP requests:
- User authentication (JWT + OIDC + CAPTCHA)
- File upload/download/management
- Metadata extraction and search
- Real-time file operations
- Download ticket generation
- File sharing (create/revoke/list shares)
- Thumbnail retrieval
- Favorites management

#### 2. **Worker Mode** (`--mode worker`)
Processes background tasks:
- Virus scanning with ClamAV
- File expiration and cleanup
- User storage facts recalculation
- Staging file cleanup
- Storage lifecycle management

#### 3. **Thumbnail Worker Mode** (`--mode thumbnail-worker`)
Generates WebP thumbnails:
- Image thumbnails (JPEG, PNG, GIF, WebP, BMP, etc.)
- PDF thumbnails (first page rendering via `pdftocairo`)
- Video thumbnails (frame extraction at 1s via `ffmpeg`)
- Encrypted file detection (flags password-protected PDFs)

#### 4. **Combined Mode** (`--mode all`)
Runs both API and Worker in a single process (default).

### Directory Structure

```
api/
├── src/
│   ├── api/
│   │   ├── handlers/          # HTTP route handlers
│   │   │   ├── auth.rs        # Authentication (register, login, OIDC)
│   │   │   ├── captcha.rs     # CAPTCHA generation & validation
│   │   │   ├── files.rs       # File operations (CRUD, bulk, archive, thumbnails, favorites)
│   │   │   ├── health.rs      # Health check & validation rules
│   │   │   ├── shares.rs      # Share link management & public share endpoints
│   │   │   ├── upload.rs      # Chunked upload handlers
│   │   │   ├── users.rs       # User profile & avatar
│   │   │   └── user_settings.rs # User preferences
│   │   ├── middleware/        # Auth, logging, rate limiting
│   │   └── error.rs           # Unified error handling
│   ├── services/              # Business logic layer
│   │   ├── file_service.rs    # Core file operations
│   │   ├── upload_service.rs  # Chunked upload orchestration
│   │   ├── share_service.rs   # Share link CRUD, password hashing, access logging
│   │   ├── thumbnail_service.rs # WebP thumbnail generation (image, PDF, video)
│   │   ├── scanner.rs         # Virus scanning (ClamAV/NoOp)
│   │   ├── metadata.rs        # EXIF/ID3/PDF extraction
│   │   ├── facts_service.rs   # Per-user storage statistics
│   │   ├── audit.rs           # Security event tracking
│   │   ├── storage.rs         # Storage service abstractions
│   │   ├── storage_lifecycle.rs # Cleanup & expiration
│   │   ├── expiration.rs      # File TTL management
│   │   └── worker.rs          # Background worker loop
│   ├── entities/              # Database models (SeaORM)
│   │   ├── users.rs           # User accounts
│   │   ├── user_files.rs      # Virtual filesystem (with is_favorite)
│   │   ├── storage_files.rs   # Physical storage (with has_thumbnail, is_encrypted)
│   │   ├── share_links.rs     # Share link records
│   │   ├── share_access_logs.rs # Share access audit trail
│   │   ├── file_metadata.rs   # Extracted metadata
│   │   ├── file_tags.rs       # File-tag associations
│   │   ├── tags.rs            # Tag definitions
│   │   ├── upload_sessions.rs # Chunked upload state
│   │   ├── user_settings.rs   # User preferences
│   │   ├── user_file_facts.rs # Cached statistics
│   │   ├── audit_logs.rs      # Audit events
│   │   └── tokens.rs          # JWT tracking
│   ├── infrastructure/        # Adapters (DB, S3, Scanner)
│   │   ├── database.rs        # Database setup & migrations
│   │   ├── storage.rs         # S3/RustFS/MinIO adapter
│   │   ├── scanner.rs         # Scanner factory
│   │   └── seed.rs            # Initial data seeding
│   ├── utils/                 # Validation, auth helpers
│   ├── models/                # Shared request/response models
│   ├── config.rs              # Configuration management
│   ├── lib.rs                 # Application setup & router
│   └── main.rs                # Entry point & CLI
├── Cargo.toml                 # Dependencies
├── Dockerfile                 # Production container
├── ARCHITECTURE.md            # Detailed architecture docs
├── postman_collection.json    # Postman API collection
└── RELEASE_NOTES.md           # Version history
```

---

## 🔒 Security Features

### 1. **Content-Addressable Storage**
- SHA-256 hashing for deduplication
- Prevents duplicate storage across all users
- Instant "upload" for existing files

### 2. **File Validation**
- Magic byte verification (file type vs extension)
- MIME type detection
- Entropy analysis (packed binary detection)
- Script injection scanning (XSS prevention)
- Path traversal protection
- Filename sanitization

### 3. **Malware Protection**
- ClamAV integration for virus scanning
- Quarantine infected files
- Background scanning queue
- Infected file download blocking (including via share links)

### 4. **Authentication & Authorization**
- JWT token-based auth
- Argon2 password hashing (OWASP recommended)
- OIDC support (OAuth2/OpenID Connect)
- CAPTCHA-protected registration
- Per-user file isolation

### 5. **Share Security**
- 192-bit cryptographically secure tokens
- Argon2id password hashing with random salts
- Server-side expiration enforcement
- Content-Disposition control (view=inline, download=attachment)
- Access logging with IP and User-Agent tracking

### 6. **Rate Limiting & Abuse Prevention**
- Request throttling
- Upload size limits (configurable)
- Concurrent connection management
- CAPTCHA cooldown periods

---

## 🚀 Getting Started

### Prerequisites

- Rust 1.84+ ([Install](https://rustup.rs/))
- PostgreSQL 14+ or SQLite
- RustFS, MinIO, or AWS S3
- ClamAV (optional, for scanning)
- `pdftocairo` / poppler-utils (optional, for PDF thumbnails)
- `ffmpeg` (optional, for video thumbnails)

### Installation

1. **Clone and navigate:**
```bash
cd api
```

2. **Configure environment:**
```bash
cp ../.env.sample .env
# Edit .env with your settings
```

3. **Run database migrations:**
```bash
cargo run --bin rust-file-backend -- --mode migrate
```

4. **Start API server:**
```bash
cargo run --release -- --mode api --port 3000
```

5. **Start background worker (separate terminal):**
```bash
cargo run --release -- --mode worker
```

6. **Start thumbnail worker (separate terminal):**
```bash
cargo run --release -- --mode thumbnail-worker
```

### Development Mode

```bash
# API with hot reload
cargo watch -x 'run -- --mode api'

# Worker with hot reload
cargo watch -x 'run -- --mode worker'

# Thumbnail worker with hot reload
cargo watch -x 'run -- --mode thumbnail-worker'
```

---

## ⚙️ Configuration

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost/rfb

# JWT Authentication
JWT_SECRET=your-secret-key-min-32-chars

# S3 Storage (RustFS/MinIO/AWS)
MINIO_ENDPOINT=http://localhost:9000
MINIO_BUCKET=file-storage
MINIO_ACCESS_KEY=rustfsadmin
MINIO_SECRET_KEY=rustfsadmin
MINIO_REGION=us-east-1
S3_PUBLIC_BASE_URL=/obj        # Public path for presigned URLs (rewritten from internal endpoint)

# Security & Upload Configuration
MAX_FILE_SIZE=1073741824       # 1GB
CHUNK_SIZE=10485760            # 10MB chunks
UPLOADS_PER_HOUR=250
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# ClamAV (optional)
ENABLE_VIRUS_SCAN=true
VIRUS_SCANNER_TYPE=clamav
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# OIDC (optional)
OIDC_ISSUER_URL=https://accounts.google.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URL=http://localhost:3000/auth/oidc/callback
OIDC_SKIP_DISCOVERY=false

# Server
HOST=0.0.0.0
PORT=3000
```

---

## 📡 API Endpoints

### Authentication
- `POST /register` — Create account (CAPTCHA-protected)
- `POST /login` — Login with credentials
- `POST /captcha` — Generate CAPTCHA challenge
- `GET /auth/oidc/login` — OIDC login
- `GET /auth/oidc/callback` — OIDC callback

### File Operations
- `POST /upload` — Single file upload
- `POST /files/upload/init` — Init chunked upload
- `GET /files/upload/sessions` — List pending sessions
- `PUT /files/upload/:id/chunk/:num` — Upload chunk
- `POST /files/upload/:id/complete` — Complete upload
- `DELETE /files/upload/:id` — Abort upload
- `GET /files` — List files (paginated, searchable, filterable)
- `GET /files/:id` — Download file
- `DELETE /files/:id` — Delete file/folder
- `PUT /files/:id/rename` — Rename/move item
- `POST /files/:id/favorite` — Toggle favorite status
- `GET /files/:id/thumbnail` — Get WebP thumbnail

### List Files Query Parameters
- `parent_id` — Filter by parent folder
- `search` — Text search
- `tags` — Comma-separated tag filter
- `category` — File category filter
- `start_date` / `end_date` — Date range filter
- `min_size` / `max_size` — Size range filter
- `regex` — Enable regex search
- `wildcard` — Enable wildcard search
- `similarity` — Enable fuzzy matching
- `is_favorite` — Filter favorites only
- `limit` / `offset` — Pagination

### Bulk Operations
- `POST /files/bulk-delete` — Delete multiple
- `POST /files/bulk-move` — Move multiple
- `POST /files/bulk-copy` — Copy multiple (recursive)

### Folders
- `POST /folders` — Create folder
- `GET /folders/tree` — Get full folder tree
- `GET /files/:id/path` — Get breadcrumb path

### Sharing (Authenticated)
- `POST /shares` — Create a share link
- `GET /shares` — List shares (optionally filter by `user_file_id`)
- `DELETE /shares/:id` — Revoke a share link
- `GET /shares/:id/logs` — Get share access logs

### Public Share (No Auth Required)
- `GET /share/:token` — Get shared item metadata
- `POST /share/:token/verify` — Verify share password
- `GET /share/:token/download` — Download shared file (`?file_id=` for folder items)
- `GET /share/:token/list` — List shared folder contents

### Advanced
- `POST /pre-check` — Check file existence (dedup)
- `POST /files/link` — Link existing storage file
- `GET /files/:id/zip-contents` — Preview archive
- `POST /files/:id/ticket` — Generate download ticket
- `GET /download/:ticket` — Download via ticket

### User & Settings
- `GET /users/me` — Get profile
- `PUT /users/me` — Update profile
- `GET /users/avatar/:user_id` — Get public avatar image
- `POST /users/me/avatar` — Upload personal avatar
- `GET /users/me/facts` — Storage statistics
- `GET /settings` — Get preferences
- `PUT /settings` — Update preferences

### System
- `GET /health` — Health check
- `GET /system/validation-rules` — Get validation config

**Full API documentation:** `http://localhost:3000/swagger-ui`

---

## 🧪 Testing

### Run Tests
```bash
cargo test
```

### Integration Tests
```bash
cargo test --test integration_tests
```

### Code Coverage
```bash
cargo tarpaulin --out Html
```

---

## 🐳 Docker

### Build Image
```bash
docker build -t rfb-api:latest .
```

### Pre-built Image (GHCR)
```bash
docker pull ghcr.io/appsjuragan/rust-file-backend-api:v8
```

### Run Container
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e MINIO_ENDPOINT=http://rustfs:9000 \
  rfb-api:latest
```

The container runs as a **non-root user** (`appuser`, UID 10001) and includes a healthcheck.

---

## 🔧 Development

### Code Formatting
```bash
cargo fmt
```

### Linting
```bash
cargo clippy -- -D warnings
```

### Dependency Audit
```bash
cargo audit
```

### Generate OpenAPI Spec
```bash
cargo run --bin rust-file-backend -- --mode api &
curl http://localhost:3000/api-docs/openapi.json > openapi.json
```

---

## 📊 Performance

- **Throughput:** 10,000+ req/s (single instance)
- **Memory:** ~50MB base, ~200MB under load
- **Upload Speed:** 500MB/s (local network)
- **Concurrent Uploads:** 100+ simultaneous
- **Database Queries:** <5ms average (indexed)

---

## 🤝 Contributing

1. Follow Rust 2024 edition conventions
2. Run `cargo fmt` and `cargo clippy` before committing
3. Add tests for new features
4. Update OpenAPI documentation

---

## 📜 License

MIT License — See LICENSE file for details.
