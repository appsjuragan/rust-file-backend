# 🚀 Rust File Backend (RFB)

[![Rust](https://img.shields.io/badge/rust-stable-brightgreen.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/react-18-blue.svg)](https://reactjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.1.0--beta.6-blue)](https://github.com/appsjuragan/rust-file-backend)

**Rust File Backend (RFB)** is a high-performance, enterprise-grade file management system. It combines the absolute memory safety and blazing speed of **Rust** on the backend with a modern, glassmorphic **React** frontend. Designed for cost-efficiency through content-addressable storage (deduplication) and scalability via parallel multipart uploads.

---

## 💎 Core Value Propositions

### ⚡ Blazing Performance
Built on the **Axum** web framework and the **Tokio** runtime, RFB handles thousands of concurrent requests with minimal CPU and RAM overhead. It uses 10x less memory than equivalent Node.js or Python solutions.

### 💰 Intelligent Storage Deduplication
RFB stops storage bloat by using **SHA-256 Content Hashing**. If a file has been uploaded before by *any* user, the system detects it instantly and creates a database link rather than a physical copy.
*   **Result:** Drastically reduced storage costs and instant "uploads" for existing content.

### 🛡️ Multi-Layered Security
*   **Malware Protection:** Built-in integration with **ClamAV** for real-time virus scanning.
*   **Identity Integrity:** **Magic Byte Verification** ensures that file extensions match their actual binary content.
*   **Sandbox Safety:** Aggressive filename sanitization and path-traversal guards.
*   **Encrypted Transport:** Designed for S3-compatible backends with full JWT-based authorization.

### 🧩 Resilient Parallel Uploads
Our custom chunked upload engine supports **parallel workers** and **exponential backoff retries**. It can handle multi-GB files even on unstable connections by sending multiple chunks simultaneously.

---

## 🏗️ Monorepo Architecture

The project is structured as a clean, modular monorepo:

### ⚙️ [Backend (api/)](./api)
*   **Core:** Rust 1.84+
*   **Framework:** Axum (Async HTTP)
*   **ORM:** SeaORM (Typed SQL)
*   **Storage:** AWS SDK for Rust (S3/MinIO)
*   **Security:** JWT, Argon2, ClamAV

### 🌐 [Frontend (web/)](./web)
*   **Core:** React 18 + TypeScript
*   **Build:** Vite 5 + Bun
*   **Styling:** Tailwind CSS (Modern Glassmorphism)
*   **Icons:** Lucide-React

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
*   [Rust](https://rustup.rs/) (Stable)
*   [Bun](https://bun.sh/)
*   [MinIO](https://min.io/) or an AWS S3 Bucket
*   Optional: [ClamAV](https://www.clamav.net/)

### 2. Environment Setup
```bash
# Backend config
cd api && cp .env.example .env

# Web config
cd ../web && echo "VITE_API_URL=http://localhost:3000" > .env
```

### 3. Run Everything
Use the provided batch script on Windows:
```bash
./run.bat
```
Or manually:
```bash
# Start API
cd api && cargo run --bin rust-file-backend -- --mode api

# Start Worker (Background processing)
cd api && cargo run --bin rust-file-backend -- --mode worker

# Start Frontend
cd web && bun run dev
```

---

## 📡 API Overview

| Feature | Description |
| :--- | :--- |
| **Auth** | JWT Register/Login + OIDC Support |
| **Files** | Upload, Download, Rename, Move, Delete |
| **Search** | Fuzzy matching with debounced suggestions |
| **Folders** | Full recursive tree management |
| **Stats** | Real-time user storage breakdown (Facts) |
| **Sharing** | Time-limited Download Tickets |
| **Preview** | Virtual archive inspection (ZIP, 7z, RAR) |

---

## 🐳 Docker Deployment

RFB is production-ready with optimized multi-stage Dockerfiles.

```bash
# Launch full stack (API + Web + Redis/DB)
docker-compose up --build
```

---

## 📜 License
Licensed under the **MIT License**. Created with ❤️ by the **Antigravity** team.

[GitHub Repository](https://github.com/appsjuragan/rust-file-backend) | [Documentation (Swagger)](http://localhost:3000/swagger-ui)
