# 🌐 RFB Web Frontend (v1.1.0)

The frontend is a modern React application built with **Vite**, **TypeScript**, and **Tailwind CSS**. It provides an intuitive, glassmorphic interface for file management with advanced features like drag-and-drop, chunked uploads, file sharing, thumbnail previews, and bulk operations.

---

## ✨ Design Philosophy

Enterprise software doesn't have to be boring. RFB Web features:

- **Glassmorphism UI:** Translucent panels, subtle blurs, soft shadows
- **Micro-interactions:** Smooth transitions, hover effects, real-time feedback
- **Responsive Design:** Seamless experience from mobile to ultra-wide displays
- **Premium Themes:** Curated dark/light modes with HSL color palettes
- **Accessibility:** Keyboard shortcuts, ARIA labels, screen reader support

---

## 🛠 Technology Stack

- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite 5 (instant HMR)
- **Runtime:** Bun (fast package management)
- **Styling:** Tailwind CSS 3
- **Icons:** Lucide React
- **Tables:** TanStack Table v8
- **File Upload:** react-dropzone
- **HTTP Client:** Custom fetch wrapper with JWT

---

## 🏗 Architecture

### Directory Structure

```
web/
├── src/
│   ├── features/              # Feature modules
│   │   ├── auth/              # Login, register, OIDC
│   │   ├── dashboard/         # Main file manager
│   │   ├── settings/          # User preferences
│   │   └── share/             # Public share page
│   │       ├── PublicSharePage.tsx  # Share viewer (password gate, media preview, folder browsing)
│   │       └── PublicSharePage.css  # Share page styles
│   ├── services/              # API clients
│   │   ├── httpClient.ts      # Fetch wrapper with auth
│   │   ├── fileService.ts     # File operations + sharing API
│   │   └── uploadService.ts   # Chunked upload logic
│   ├── components/            # Shared UI components
│   │   ├── Layout/            # Header, sidebar, footer
│   │   └── UI/                # Buttons, modals, inputs
│   ├── hooks/                 # Custom React hooks
│   ├── utils/                 # Helper functions
│   └── App.tsx                # Root component
├── lib/                       # Reusable file manager library
│   ├── components/            # File manager components
│   │   ├── ContextMenu/       # Right-click menu
│   │   ├── Icons/             # SVG file type icons with thumbnails
│   │   ├── Layout/            # Sidebar with share navigation
│   │   ├── Modals/            # Preview, rename, metadata, share
│   │   ├── Toasts/            # Upload progress, notifications
│   │   └── Workspace/         # File grid/list views, folder path
│   ├── context/               # React context providers (FileManagerContext)
│   ├── types/                 # TypeScript interfaces
│   └── utils/                 # File utilities
├── public/                    # Static assets
├── index.html                 # Entry HTML
├── vite.config.ts             # Vite configuration
└── tailwind.config.cjs        # Tailwind configuration
```

---

## 🚀 Key Features

### 📤 Advanced Upload System

**Chunked Parallel Uploads:**
- Files split into 10MB chunks (configurable)
- 4 parallel workers for concurrent chunk uploads
- Exponential backoff retry on failure
- Real-time progress tracking per file
- Resume capability for interrupted uploads

**Drag-and-Drop:**
- Upload files and folders via drag-and-drop
- Recursive folder structure preservation
- Visual dropzone feedback

**Deduplication:**
- Pre-upload SHA-256 hash check
- Instant "upload" for existing files
- Automatic file linking

### 📁 File Management

**Operations:**
- Create, rename, move, delete files/folders
- Bulk actions (select multiple items)
- Copy/paste with recursive folder duplication
- Cut/paste for moving items
- Archive preview (ZIP, 7z, RAR, TAR)
- Toggle favorites (star/unstar)

**Navigation:**
- Breadcrumb path navigation
- Grid and list view modes
- Infinite scroll pagination
- Folder tree for move/copy target selection
- Real-time search with debouncing
- Keyboard shortcuts (Ctrl+A, Ctrl+C, Ctrl+V, Delete)

**UI Features:**
- Context menus (right-click)
- File preview modals
- Metadata inspection
- Upload progress toasts
- Highlighted items after operations
- Thumbnail previews with lazy loading

### 🔗 File Sharing

**Share Management:**
- Create share links with configurable permissions (`view` / `download`)
- Optional password protection
- Configurable expiration (up to 1 year)
- Public or user-specific sharing
- Revoke shares instantly
- View share access logs (views, downloads, password attempts)

**Sidebar Integration:**
- Active shares listed in sidebar
- Click to navigate to shared item
- View/download icons for quick access

**Public Share Page:**
- Beautiful standalone page for share recipients
- Password gate with unlock animation
- Media preview (image, video, audio, PDF inline viewing)
- Folder browsing with file listing
- Download buttons (when permission allows)
- View-only mode (disables download, prevents right-click save)
- Branded footer

### 🖼️ Thumbnail Previews

- WebP thumbnails loaded asynchronously
- Smooth fade-in animations on load
- Optimized 256px previews for images, PDFs, and videos
- Fallback to file type icons for unsupported formats
- Encrypted file detection (skips thumbnail requests)

### 🔍 Search & Filter

- Real-time search as you type
- Fuzzy matching support
- Date range filtering
- Regex and wildcard search
- Tag and category filtering
- Size range filtering
- Favorites-only filter
- Search result highlighting

### 🎨 User Experience

- Smooth animations and transitions
- Loading states and skeletons
- Error handling with user-friendly messages
- Responsive layout (mobile, tablet, desktop)
- Dark/light theme toggle
- Customizable preferences

---

## 🚥 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) 1.1+ (recommended) or Node.js 18+

### Installation

```bash
# Install dependencies
bun install

# Or with npm
npm install
```

### Configuration

Create `.env` file:

```env
VITE_API_URL=http://localhost:3000
VITE_CHUNK_SIZE=10485760
```

### Development

```bash
# Start dev server with HMR
bun run dev

# Or with npm
npm run dev
```

Access at: `http://localhost:5173`

### Build for Production

```bash
# Build optimized bundle
bun run build

# Preview production build
bun run preview
```

---

## 🐳 Docker

### Build Image

```bash
docker build --build-arg VITE_API_URL=https://api.example.com -t rfb-web:latest .
```

### Run Container

```bash
docker run -p 80:80 rfb-web:latest
```

The production image uses **nginx** to serve static files with reverse proxy configuration for the API.

---

## 🔧 Configuration

### Environment Variables

```env
# Backend API URL
VITE_API_URL=http://localhost:3000

# Upload chunk size (must match backend)
VITE_CHUNK_SIZE=10485760
```

### Tailwind Customization

Edit `tailwind.config.cjs` to customize:
- Color palette
- Spacing scale
- Typography
- Breakpoints
- Animations

### Vite Configuration

Edit `vite.config.ts` for:
- Build optimizations
- Proxy settings
- Plugin configuration

---

## 📦 Components

### Core Components

**ReactFileManager** (`lib/ReactFileManager.tsx`)
- Main file manager component
- Handles state management
- Provides context to child components
- Triggers share refresh after operations

**Workspace** (`lib/components/Workspace/`)
- File grid and list views
- Drag-and-drop support
- Marquee selection
- Keyboard navigation
- Thumbnail rendering

**ContextMenu** (`lib/components/ContextMenu/`)
- Right-click actions
- Copy, cut, paste, delete
- Download, rename, preview
- Share and favorite toggles

**Sidebar** (`lib/components/Layout/Sidebar.tsx`)
- Navigation sidebar
- Active shares list with icons
- Click-to-navigate to shared items
- View and download shortcuts

**Modals** (`lib/components/Modals/`)
- PreviewModal: File preview
- MetadataModal: File details
- RenameModal: Rename/move
- NewFolderModal: Create folder

**Toasts** (`lib/components/Toasts/`)
- UploadProgressToast: Upload status
- OperationToast: Action feedback
- DialogModal: Confirmations

**PublicSharePage** (`src/features/share/PublicSharePage.tsx`)
- Standalone share viewer
- Password verification
- Inline media preview (images, video, audio, PDF)
- Folder content browsing
- Download controls

### Services

**fileService.ts**
- File CRUD operations
- Bulk actions
- Search and filtering
- Download ticket generation
- Share link CRUD (create, list, revoke, logs)
- Public share endpoints (info, verify password, download URL, folder listing)

**uploadService.ts**
- Chunked upload orchestration
- Parallel worker management
- Retry logic with exponential backoff
- Progress tracking

**httpClient.ts**
- Fetch wrapper with JWT auth
- Automatic token refresh
- Error handling
- Request/response interceptors

---

## 🧪 Testing

```bash
# Run tests
bun test

# Run with coverage
bun test --coverage
```

---

## 🎨 Styling

### Tailwind Utilities

Custom utilities defined in `tailwind.config.cjs`:
- Glassmorphic backgrounds
- Custom animations
- Color palette extensions
- Responsive breakpoints

### CSS Modules

Component-specific styles in `.css` files:
- `Workspace.css` - File manager styles
- `ContextMenu.css` - Menu positioning
- `PublicSharePage.css` - Share page styles
- `FileIcon.css` - File icon and thumbnail styles
- `tailwind.css` - Global styles and utilities

---

## 🔑 Keyboard Shortcuts

- **Ctrl+A** - Select all files
- **Ctrl+C** - Copy selected items
- **Ctrl+X** - Cut selected items
- **Ctrl+V** - Paste items
- **Delete** - Delete selected items
- **Escape** - Clear selection / Close modals
- **Shift+Click** - Range selection

---

## 🤝 Contributing

1. Follow TypeScript strict mode
2. Use Prettier for formatting: `bun run format`
3. Run ESLint: `bun run lint`
4. Add tests for new features
5. Update component documentation

---

## 📊 Performance

- **Bundle Size:** ~300KB gzipped
- **First Load:** <1s on 3G
- **Time to Interactive:** <2s
- **Lighthouse Score:** 95+
- **Code Splitting:** Automatic route-based splitting

---

## 📜 License

MIT License - See LICENSE file for details.