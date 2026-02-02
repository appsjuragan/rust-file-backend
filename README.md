# 🚀 Rust File Backend: The Ultimate Enterprise Storage Engine

[![Rust](https://img.shields.io/badge/rust-stable-brightgreen.svg)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Beta](https://img.shields.io/badge/version-0.1.0--beta.6-blue)](https://github.com/appsjuragan/rust-file-backend)

### **Stop Wasting Storage. Start Scaling Securely.**

In a world where data is exploding, most backends are just "dumb pipes" that eat up your disk space and leave your servers vulnerable. **Rust File Backend** is different. It's a high-performance, intelligent storage powerhouse designed to save you money, protect your users, and scale to millions of files without breaking a sweat.

---

## 🌟 Why This is a "Must-Have" for Your Next Project

### 💰 **The Storage Saver (Deduplication)**
Why store the same 100MB video ten times just because ten users uploaded it? Our engine uses **SHA-256 Content Hashing**. If a file already exists on your server, we don't store it again. We simply point the new user to the existing file. 
*   **Result:** Up to 90% reduction in storage costs for shared content.

### 🛡️ **The Digital Fortress (Security First)**
We don't just trust file extensions. 
*   **Virus Scanning:** Integrated with **ClamAV** to stop malware before it hits your disk.
*   **Magic Byte Verification:** We peek inside the file to ensure a `.jpg` is actually an image, not a hidden script.
*   **Path Traversal Protection:** Automatic sanitization to prevent hackers from escaping the storage sandbox.

### ⚡ **Blazing Fast & Lightweight**
Built with **Rust** and the **Tokio** async engine. It's designed to handle **50,000+ concurrent connections** while using a fraction of the RAM required by Node.js or Python backends. 
*   **Streaming Power:** We stream files directly to storage (S3/MinIO). Even a 1GB upload won't crash your server's memory.

### 🧠 **Smart Metadata Extraction**
Our backend doesn't just store bytes; it understands them. It automatically extracts:
*   **Images:** EXIF data, camera models, dimensions.
*   **Documents:** Word counts, page counts, authors, versions.
*   **Media:** Durations, bitrates, codecs.

---

## 🏗️ The Enterprise Blueprint (Architecture)

We didn't just write code; we engineered a masterpiece. This project follows **Hexagonal Architecture (Ports & Adapters)**, the gold standard for enterprise software.

*   **Domain Isolation:** Your business rules are protected from technical changes.
*   **Pluggable Infrastructure:** Swap PostgreSQL for SQLite or MinIO for AWS S3 in minutes.
*   **Observability:** Built-in **Request-ID tracking** and **Performance Metrics** so you always know what's happening under the hood.
*   **Graceful Reliability:** Background workers handle cleanup and expiration silently, with full support for graceful shutdowns.

---

## 🛠️ Features at a Glance

### Core Features
- 🔑 **JWT Authentication**: Secure, industry-standard user management with OIDC support.
- 👤 **Profile Management**: Update your name, email, and password with ease.
- 🖼️ **Avatars & MinIO**: Integrated profile picture support, stored securely in S3-compatible buckets.
- ☁️ **S3-Compatible**: Works perfectly with AWS S3, MinIO, DigitalOcean Spaces, and more.
- 📂 **Folder Support**: Full recursive folder management and bulk operations.
- 📊 **File Facts & Statistics**: Real-time per-user storage statistics including total size and file type classification.
- ⏳ **Auto-Expiration**: Set files to self-destruct after a certain number of hours.
- 📖 **Swagger UI**: Beautiful, interactive API documentation out of the box.
- 🏥 **Health Monitoring**: Real-time status of your database and storage connectivity.

### Advanced Features (v0.1.0-beta.6)
- 🔍 **Similarity Search**: Fuzzy filename search powered by PostgreSQL trigram extension.
- 📄 **Lazy Loading**: Efficient offset-based pagination for file lists and search suggestions.
- 🎨 **User Settings**: Persistent theme and view style preferences.
- 🎫 **Download Tickets**: Secure, time-limited download links for file sharing.
- 📦 **Bulk Operations**: Move and delete multiple files/folders in a single request.
- 🗜️ **Archive Preview**: Inspect contents of ZIP, 7z, TAR, and RAR archives without downloading.

---

## 📁 Project Structure

This project is organized as a monorepo:
- **`api/`**: The Rust backend service.
- **`web/`**: The React frontend application (Vite + TailwindCSS).

---

## 🚦 Quick Start in 3 Steps

### 1. Prepare Your Environment
Copy the example configuration for the backend:
```bash
cd api
cp .env.example .env
```

### 2. Launch the Engine
You can use the root `run.bat` to start both backend and frontend, or run them manually:

**Backend:**
```bash
cd api
cargo run --release
```

**Frontend:**
```bash
cd web
bun install
bun run dev
```

### 3. Explore the API
Open your browser to:
`http://127.0.0.1:3000/swagger-ui`

---

## 📡 API Endpoints Summary

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Register a new user |
| POST | `/login` | Login with username/password |
| GET | `/auth/oidc/login` | Initiate OIDC login flow |
| GET | `/auth/oidc/callback` | OIDC callback handler |

### Files & Folders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload a file (multipart) |
| POST | `/files/pre-check` | Check if file exists (deduplication) |
| POST | `/files/link` | Link to existing storage file |
| GET | `/files` | List files with pagination & search |
| GET | `/files/{id}` | Download a file |
| DELETE | `/files/{id}` | Delete a file or folder |
| PUT | `/files/{id}/rename` | Rename a file or folder |
| GET | `/files/{id}/zip-contents` | Get archive contents |
| POST | `/files/{id}/ticket` | Generate download ticket |
| GET | `/tickets/{ticket}` | Download via ticket |
| POST | `/folders` | Create a new folder |
| GET | `/folders/{id}/path` | Get folder breadcrumb path |
| POST | `/files/bulk-delete` | Bulk delete files/folders |
| POST | `/files/bulk-move` | Bulk move files/folders |

### Users & Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/me` | Get current user profile |
| PUT | `/users/me` | Update user profile |
| POST | `/users/me/avatar` | Upload avatar image |
| GET | `/users/me/avatar` | Get avatar image |
| GET | `/users/me/facts` | Get storage statistics |
| GET | `/settings` | Get user settings |
| PUT | `/settings` | Update user settings |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | System health check |

---

## 📊 Tech Stack of the Future

*   **Language:** Rust 1.93+ (Memory safe, zero-cost abstractions)
*   **Web Framework:** Axum 0.7 (High performance, ergonomic)
*   **Database ORM:** SeaORM 1.1 (Type-safe, async)
*   **Database:** PostgreSQL or SQLite
*   **Storage Client:** AWS SDK for Rust (Enterprise grade)
*   **Security:** Argon2 (Password hashing), JWT (Tokens), ClamAV (Virus scanning)
*   **Frontend:** React 18 + Vite 5 + TailwindCSS 3

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

### **Ready to build something legendary?**
[Get Started Now](https://github.com/appsjuragan/rust-file-backend) | [Report a Bug](https://github.com/appsjuragan/rust-file-backend/issues)
