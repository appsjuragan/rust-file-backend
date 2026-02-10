# 🌐 Rust File Backend: Modern Web Frontend

This is the official React-based frontend for the **Rust File Backend**. It provides a sleek, high-performance interface for managing your enterprise storage, built with React, Vite, and Tailwind CSS.

---

## ✨ Features

- **🚀 Blazing Fast**: Powered by Vite and Bun for near-instant load times and development.
- **📁 Full File Management**: Create folders, rename items, and delete files with a familiar desktop-like interface.
- **📤 Smart Uploads**: Supports drag-and-drop uploads with real-time progress.
- **🔍 Content-Aware**: Seamlessly integrates with the backend's metadata extraction to show file details.
- **🛡️ Secure**: Built-in JWT authentication and secure download handling.
- **🌏 Full UTF-8 Support**: Correctly handles and displays filenames in any language (Chinese, Japanese, Korean, etc.).
- **🎨 Premium Design**: Modern UI with smooth transitions, responsive layout, and Lucide icons.

---

## 🛠️ Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **Runtime**: Bun (Recommended)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State Management**: TanStack Table & React Hooks

---

## 🚦 Getting Started

### 1. Prerequisites
Ensure you have [Bun](https://bun.sh/) installed on your system.

### 2. Install Dependencies
```bash
bun install
```

### 3. Configure Environment
Create a `.env` file in the `web` directory (or ensure the backend is running on the default port):
```env
VITE_API_URL=http://localhost:3000
```

### 4. Launch Development Server
```bash
bun run dev
```
The app will be available at `http://localhost:5173`.

---

## 🏗️ Project Structure

- `src/features`: Feature-based modules containing logic, components, and styles (e.g., `auth`, `dashboard`).
- `src/services`: Domain-specific API services (`authService`, `fileService`, `userService`, `uploadService`) built on a centralized `httpClient`.
- `src/captcha`: Modular CAPTCHA implementation with custom hooks and widgets.
- `src/components`: Reusable UI components (File list, Modals, Uploaders).
- `src/lib`: Core library code and types.
- `src/utils`: Shared utility functions (`errorFormatter`, `validation`).
- `src/App.tsx`: Main application entry and high-level routing orchestrator.

---

## 📜 License

This project is licensed under the **MIT License**.