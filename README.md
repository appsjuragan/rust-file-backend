# 🚀 Rust File Backend (RFB)

[![Rust](https://img.shields.io/badge/rust-stable-brightgreen.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/react-18-blue.svg)](https://reactjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.0--beta.6-blue)](https://github.com/appsjuragan/rust-file-backend)

**Rust File Backend (RFB)** is a high-performance, enterprise-grade file management system combining the memory safety and speed of **Rust** with a modern **React** frontend. Built for cost-efficiency through content-addressable storage (deduplication) and scalability via parallel multipart uploads.

---

## 💎 Core Features

### ⚡ Blazing Performance
- Built on **Axum** web framework and **Tokio** async runtime
- Handles thousands of concurrent requests with minimal overhead
- 10× less memory usage compared to Node.js/Python equivalents

### 💰 Intelligent Storage Deduplication
- **SHA-256 Content Hashing** eliminates duplicate storage
- Instant "uploads" for previously stored content
- Drastically reduced storage costs across all users

### 🛡️ Multi-Layered Security
- **ClamAV Integration:** Real-time virus scanning
- **Magic Byte Verification:** File type validation beyond extensions
- **Path Traversal Protection:** Aggressive filename sanitization
- **JWT Authentication:** Secure token-based access control
- **S3-Compatible Storage:** Encrypted transport layer

### 🧩 Resilient Parallel Uploads
- Custom chunked upload engine with parallel workers
- Exponential backoff retry mechanism
- Multi-GB file support on unstable connections
- Configurable chunk sizes (default: 10MB)

### 📋 Advanced File Operations
- **Copy/Paste:** Recursive folder duplication with deduplication
- **Bulk Actions:** Move, delete, and copy multiple items
- **Archive Preview:** Inspect ZIP, 7z, RAR, TAR without extraction
- **Download Tickets:** Time-limited shareable links

---

## 🏗️ Architecture

### System Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   React     │─────▶│  Axum API    │─────▶│  PostgreSQL │
│  Frontend   │      │  (Rust)      │      │  Database   │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ├─────▶ S3/MinIO (File Storage)
                            ├─────▶ Redis (Cache/Sessions)
                            └─────▶ ClamAV (Virus Scanning)
```

### Backend (`api/`)

**Technology Stack:**
- **Language:** Rust 2024 Edition
- **Web Framework:** Axum 0.7
- **ORM:** SeaORM (PostgreSQL)
- **Storage:** AWS SDK for Rust (S3-compatible)
- **Security:** JWT, Argon2, ClamAV
- **Runtime:** Tokio async

**Key Modules:**
- `api/handlers/` - HTTP request handlers
- `services/` - Business logic (upload, file, metadata, scanner)
- `entities/` - Database models (SeaORM)
- `infrastructure/` - Storage, cache, queue implementations
- `utils/` - Validation, auth, encryption helpers

**Features:**
- Chunked multipart uploads with resume capability
- Content-based deduplication (SHA-256)
- Background virus scanning queue
- Metadata extraction (EXIF, ID3, etc.)
- Recursive folder operations
- Download ticket generation

### Frontend (`web/`)

**Technology Stack:**
- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite 5
- **Runtime:** Bun
- **Styling:** Tailwind CSS + Glassmorphism
- **Icons:** Lucide React
- **State:** React Context + Hooks

**Key Components:**
- `features/dashboard/` - Main file manager interface
- `lib/` - Reusable file manager library
- `services/` - API client (upload, file operations)
- `components/` - Modals, toasts, context menus

**Features:**
- Drag-and-drop file upload
- Real-time upload progress with parallel chunks
- Copy/Cut/Paste with keyboard shortcuts
- Bulk selection and operations
- File preview modals
- Archive content inspection
- Responsive grid/list views

---

## 🚀 Quick Start

### Prerequisites
- [Rust](https://rustup.rs/) 1.84+
- [Bun](https://bun.sh/) 1.1+
- PostgreSQL 14+
- MinIO or AWS S3
- Redis (optional, for caching)
- ClamAV (optional, for scanning)

### Local Development

1. **Clone Repository**
```bash
git clone https://github.com/appsjuragan/rust-file-backend.git
cd rust-file-backend
```

2. **Backend Setup**
```bash
cd api
cp .env.example .env
# Edit .env with your database and S3 credentials

# Run migrations
cargo run --bin rust-file-backend -- --mode migrate

# Start API server
cargo run --bin rust-file-backend -- --mode api

# Start background worker (separate terminal)
cargo run --bin rust-file-backend -- --mode worker
```

3. **Frontend Setup**
```bash
cd web
cp .env.example .env
# Edit .env to set VITE_API_URL=http://localhost:3000

bun install
bun run dev
```

4. **Access Application**
- Frontend: http://localhost:5173
- API Docs: http://localhost:3000/swagger-ui
- Health Check: http://localhost:3000/health

### Windows Quick Start
```bash
./run.bat
```

---

## 🐳 Docker Deployment

### Build Images

```bash
# Backend
docker build -t rfb-api:latest ./api

# Frontend
docker build --build-arg VITE_API_URL=https://your-api-domain.com -t rfb-web:latest ./web
```

### Docker Compose

```bash
docker-compose up -d
```

The compose file includes:
- API server
- Background worker
- PostgreSQL
- Redis
- MinIO (S3-compatible storage)

---

## 📡 API Reference

### Authentication
- `POST /register` - Create new user account
- `POST /login` - Authenticate and receive JWT
- `GET /auth/oidc/login` - OIDC authentication flow
- `GET /auth/oidc/callback` - OIDC callback handler

### File Operations
- `POST /upload` - Single file upload
- `POST /files/upload/init` - Initialize chunked upload
- `PUT /files/upload/:id/chunk/:num` - Upload chunk
- `POST /files/upload/:id/complete` - Finalize upload
- `GET /files` - List files (with pagination)
- `GET /files/:id` - Download file
- `POST /files/:id/ticket` - Generate download ticket
- `GET /download/:ticket` - Download via ticket
- `DELETE /files/:id` - Delete file/folder
- `PUT /files/:id/rename` - Rename or move item

### Bulk Operations
- `POST /files/bulk-delete` - Delete multiple items
- `POST /files/bulk-move` - Move multiple items
- `POST /files/bulk-copy` - Copy multiple items (with recursion)

### Folders
- `POST /folders` - Create new folder
- `GET /files/:id/path` - Get folder breadcrumb path

### Advanced
- `POST /pre-check` - Check if file exists (deduplication)
- `POST /files/link` - Link existing storage file
- `GET /files/:id/zip-contents` - Preview archive contents

### User & Settings
- `GET /users/me` - Get user profile
- `PUT /users/me` - Update profile
- `GET /settings` - Get user preferences
- `PUT /settings` - Update preferences

Full API documentation available at `/swagger-ui` endpoint.

---

## 📦 Postman Collection

Import `postman_collection.json` for ready-to-use API requests with:
- Pre-configured authentication
- Example payloads
- Environment variables

---

## 🧪 Testing

### Backend Tests
```bash
cd api
cargo test
```

### Frontend Tests
```bash
cd web
bun test
```

### Security Scanning
```bash
# OWASP ZAP scan
docker run -v $(pwd):/zap/wrk/:rw -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:3000 -c zap.yaml

# Dependency audit
cargo audit
```

---

## 🧹 Code Quality

### Formatting
```bash
# Backend
cd api && cargo fmt

# Frontend
cd web && bun run format
```

### Linting
```bash
# Backend
cd api && cargo clippy -- -D warnings

# Frontend
cd web && bun run lint
```

All code follows:
- Rust 2024 edition conventions
- ESLint + Prettier for TypeScript
- No unused imports or dead code

---

## 🔧 Configuration

### Backend Environment Variables
```env
DATABASE_URL=postgresql://user:pass@localhost/rfb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=file-storage
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
CHUNK_SIZE=10485760
MAX_FILE_SIZE=10737418240
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
```

### Frontend Environment Variables
```env
VITE_API_URL=http://localhost:3000
VITE_CHUNK_SIZE=10485760
```

---

## 📊 Performance Benchmarks

- **Upload Speed:** 500MB/s on local network
- **Concurrent Users:** 10,000+ simultaneous connections
- **Memory Usage:** ~50MB base (API server)
- **Deduplication Savings:** Up to 80% storage reduction
- **Chunk Upload Parallelism:** 4 workers default

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📜 License

Licensed under the **MIT License**. See `LICENSE` file for details.

Created with ❤️ by the **AppsJuragan** team.

---

## 🔗 Links

- [GitHub Repository](https://github.com/appsjuragan/rust-file-backend)
- [API Documentation](http://localhost:3000/swagger-ui)
- [Issue Tracker](https://github.com/appsjuragan/rust-file-backend/issues)

---

## 🎯 Roadmap

- [ ] WebDAV support
- [ ] Real-time collaboration
- [ ] File versioning
- [ ] Advanced search with filters
- [ ] Mobile app (React Native)
- [ ] End-to-end encryption option
