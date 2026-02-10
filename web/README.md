# 🌐 RFB Web: The Premium Frontend

The `web` directory contains the modern React frontend for the Rust File Backend. It provides a visual, intuitive interface for heavy-duty file management.

---

## ✨ Design Philosophy

We believe enterprise software shouldn't look boring. RFB Web features:
- **Glassmorphism UI**: Subtle blurs, transclucent panels, and soft shadows.
- **Deep Micro-interactions**: Hover effects, smooth transitions, and real-time state updates.
- **Responsive Layout**: Seamless experience from ultra-wide monitors to mobile devices.
- **Premium Dark/Light Modes**: Curated HSL color palettes for maximum readability.

---

## 🛠 Tech Stack

- **React 18**: Component-based UI architecture.
- **Vite 5**: The next-generation frontend tool for near-instant HMR.
- **Bun**: Modern JavaScript runtime for blazing-fast installs and execution.
- **Tailwind CSS**: Utility-first styling for custom, high-fidelity designs.
- **Lucide React**: Beautiful, consistent iconography.
- **TanStack Table**: Efficient rendering for large file lists.

---

## 🚀 Key Features

### 📤 High-Concurrency Uploads
Our advanced `uploadService` handles large files by splitting them into chunks and sending them in **parallel**.
- **Retry Mechanism**: Automatic exponential backoff for failed chunks.
- **Progress Tracking**: Per-file and aggregate progress bars.
- **Drag-and-Drop**: Upload entire folders or individual files.

### 🔍 Real-time Search
Search through thousands of files instantly.
- **Debounced Input**: Efficient API usage as you type.
- **Dropdown Suggestions**: Quick navigation to folders and files.

### 📁 Advanced File Management
- **Bulk Operations**: Select multiple items to move or delete.
- **Breadcrumb Navigation**: Deep tree traversal with easy path jumping.
- **Context Menus**: Right-click actions for a desktop-like experience.

---

## 🚥 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (Recommended) or Node.js

### Installation
```bash
bun install
```

### Development
```bash
bun run dev
```

### Configuration
Edit `.env` to point to your backend:
```env
VITE_API_URL=http://localhost:3000
VITE_CHUNK_SIZE=7340032 # Should match backend
```

---

## 📁 Source Overview
- `src/features`: Modular feature sets (Auth, Dashboard, Settings).
- `src/services`: API abstraction layers using a custom `httpClient`.
- `src/components`: UI components organized by complexity (Atoms, Molecules, Organisms).
- `src/lib`: Shared types and library wrappers.