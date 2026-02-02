import React, { useEffect, useState, useCallback } from "react";
import { ReactFileManager, CommonModal } from "../lib";
import { api, getAuthToken, setAuthToken, clearAuthToken } from "./api";
import { formatFriendlyError } from "./utils/errorFormatter";
import { isRestrictedFile } from "./utils/validation";
import type { FileSystemType, FileType, UploadStatus } from "../lib/types";
import "./App.css";
import "../lib/tailwind.css";

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(!!getAuthToken());
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [bgImage, setBgImage] = useState("");
    const [bgLoaded, setBgLoaded] = useState(false);
    const [error, setError] = useState("");
    const [fs, setFs] = useState<FileSystemType>([]);
    const [loading, setLoading] = useState(false);
    const [authLoading, setAuthLoading] = useState(false);
    const [currentFolder, setCurrentFolder] = useState<string>(() => {
        return localStorage.getItem("currentFolder") || "0";
    });
    const [profile, setProfile] = useState<{ id: string, name?: string, email?: string, avatarUrl?: string }>({ id: "", name: "", email: "", avatarUrl: "" });
    const [userFacts, setUserFacts] = useState<any>(null);

    useEffect(() => {
        if (!isAuthenticated) {
            const idx = Math.floor(Math.random() * 8);
            fetch(`https://bing.biturl.top/?resolution=1920&format=json&index=${idx}&mkt=en-US`)
                .then(res => res.json())
                .then(data => {
                    if (data.url) {
                        const img = new Image();
                        img.onload = () => {
                            setBgImage(data.url);
                            setBgLoaded(true);
                        };
                        img.src = data.url;
                    }
                })
                .catch(err => console.error("Failed to load background:", err));
        }
    }, [isAuthenticated]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) {
            setAuthToken(token);
            setIsAuthenticated(true);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    const fetchProfile = useCallback(async () => {
        try {
            const p = await api.getProfile();
            setProfile({
                ...p,
                avatarUrl: p.avatar_url ? api.getAvatarUrl(p.avatar_url) : undefined
            });
            if (p.username) setUsername(p.username);
        } catch (err) {
            console.error("Failed to fetch profile:", err);
        }
    }, []);

    const fetchUserFacts = useCallback(async () => {
        try {
            const data = await api.getUserFacts();
            setUserFacts(data);
        } catch (err) {
            console.error("Failed to fetch user facts:", err);
        }
    }, []);

    const fetchFiles = useCallback(async (parentId?: string, silent = false) => {
        if (!silent) setLoading(true);
        const effectiveParentId = parentId || "0";
        try {
            const data = await api.listFiles(parentId === "0" ? undefined : parentId);
            const mappedFs: FileSystemType = data.map((item: any) => ({
                id: item.id,
                name: item.filename,
                isDir: item.is_folder,
                parentId: item.parent_id || "0",
                lastModified: new Date(item.created_at).getTime() / 1000,
                scanStatus: item.scan_status,
                size: item.size,
                mimeType: item.mime_type,
                hash: item.hash,
                extraMetadata: item.extra_metadata,
            }));

            setFs(prevFs => {
                // Remove existing items that belong to this parent to handle deletions
                let newFs = prevFs.filter(f => (f.parentId || "0") !== effectiveParentId && f.id !== "0");

                // Add the new items
                newFs = [...newFs, ...mappedFs];

                // Ensure root is present
                if (!newFs.some(f => f.id === "0")) {
                    newFs.unshift({ id: "0", name: "/", isDir: true, path: "/" });
                }
                return newFs;
            });
        } catch (err: any) {
            console.error("Failed to fetch files:", err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [setFs]);

    useEffect(() => {
        if (isAuthenticated) {
            localStorage.setItem("currentFolder", currentFolder);
            // localStorage.setItem("username", username);

            // Fetch user settings
            api.getSettings().then((settings: any) => {
                if (settings && settings.theme) {
                    setTheme(settings.theme);
                }
            }).catch(console.error);

            // Fetch profile and facts
            fetchProfile();
            fetchUserFacts();
            fetchFiles(currentFolder);
        }
    }, [currentFolder, username, isAuthenticated, fetchProfile, fetchUserFacts, fetchFiles]);

    useEffect(() => {
        if (isAuthenticated) {
            const interval = setInterval(fetchUserFacts, 60000);
            return () => clearInterval(interval);
        }
    }, [isAuthenticated, fetchUserFacts]);




    const fsRef = React.useRef(fs);
    useEffect(() => {
        fsRef.current = fs;
    }, [fs]);

    const currentFolderRef = React.useRef(currentFolder);
    useEffect(() => {
        currentFolderRef.current = currentFolder;
    }, [currentFolder]);

    const alertedInfectedFiles = React.useRef<Set<string>>(new Set());

    useEffect(() => {
        if (isAuthenticated) {
            fetchFiles(currentFolder);

            // If we are in a subfolder, fetch the path to reconstruct breadcrumbs
            if (currentFolder !== "0") {
                api.getFolderPath(currentFolder).then((path: any) => {
                    const mappedPath: FileSystemType = path.map((item: any) => ({
                        id: item.id,
                        name: item.filename,
                        isDir: item.is_folder,
                        parentId: item.parent_id || "0",
                        lastModified: new Date(item.created_at).getTime() / 1000,
                        scanStatus: item.scan_status,
                        size: item.size,
                        mimeType: item.mime_type,
                        hash: item.hash,
                    }));

                    setFs(prevFs => {
                        const newFs = [...prevFs];
                        mappedPath.forEach(item => {
                            if (!newFs.some(f => f.id === item.id)) {
                                newFs.push(item);
                            }
                        });
                        return newFs;
                    });
                }).catch(err => {
                    console.error("Failed to fetch folder path:", err);
                    setCurrentFolder("0"); // Fallback to root if folder not found
                });
            }

            // Poll every 5 seconds if there are pending files
            const interval = setInterval(() => {
                const currentFs = fsRef.current;
                const hasPending = currentFs.some(f => f.scanStatus === 'pending');
                if (hasPending) {
                    fetchFiles(currentFolderRef.current, true);
                }

                // Check for infected files to show toast/alert
                const infectedFiles = currentFs.filter(f => f.scanStatus === 'infected');
                const newInfectedFiles = infectedFiles.filter(f => !alertedInfectedFiles.current.has(f.id));

                if (newInfectedFiles.length > 0) {
                    newInfectedFiles.forEach(f => {
                        alert(`🚨 MALWARE DETECTED: The file "${f.name}" has been flagged as infected and will be deleted.`);
                        alertedInfectedFiles.current.add(f.id);
                    });
                    // Refresh after alert to show they are gone (or marked as infected)
                    fetchFiles(currentFolderRef.current, true);
                }
            }, 5000);

            return () => clearInterval(interval);
        }
    }, [isAuthenticated, fetchFiles, currentFolder]);

    const validateInputs = () => {
        if (username.length < 3) {
            setError("Username must be at least 3 characters");
            return false;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return false;
        }
        return true;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!validateInputs()) return;
        setAuthLoading(true);
        try {
            const res = await api.login({ username, password });
            setAuthToken(res.token);
            setIsAuthenticated(true);
        } catch (err: any) {
            setError(formatFriendlyError(err.message));
        } finally {
            setAuthLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!validateInputs()) return;
        setAuthLoading(true);
        try {
            await api.register({ username, password });
            const res = await api.login({ username, password });
            setAuthToken(res.token);
            setIsAuthenticated(true);
        } catch (err: any) {
            setError(formatFriendlyError(err.message));
        } finally {
            setAuthLoading(false);
        }
    };

    const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
    const [profileModalVisible, setProfileModalVisible] = useState(false);
    const [editName, setEditName] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editPassword, setEditPassword] = useState("");

    useEffect(() => {
        if (profileModalVisible) {
            setEditName(profile.name || "");
            setEditEmail(profile.email || "");
            setEditPassword("");
        }
    }, [profileModalVisible, profile]);

    const handleSaveProfile = async () => {
        try {
            await api.updateProfile({
                name: editName,
                email: editEmail,
                password: editPassword || undefined
            });
            await fetchProfile();
            setProfileModalVisible(false);
        } catch (err: any) {
            alert(formatFriendlyError(err.message));
        }
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                await api.uploadAvatar(e.target.files[0]);
                await fetchProfile();
            } catch (err: any) {
                alert(formatFriendlyError(err.message));
            }
        }
    };

    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        if (theme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    }, [theme]);

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light";
        setTheme(newTheme);
        api.updateSettings({ theme: newTheme }).catch(console.error);
    };

    const handleLogout = () => {
        clearAuthToken();
        setIsAuthenticated(false);
        setFs([]);
        setCurrentFolder("0");
        localStorage.removeItem("currentFolder");
        localStorage.removeItem("username");
        // Reset theme to default dark mode
        localStorage.removeItem("theme");
        setTheme("dark");
        setUsername("");
        setPassword("");
        setProfile({ id: "", name: "", email: "", avatarUrl: "" });
        setDropdownVisible(false);
    };


    const onRefresh = async (id: string) => {
        await fetchFiles(id);
        fetchUserFacts();
    };

    const [pendingUpload, setPendingUpload] = useState<{ file: File, folderId: string, onProgress?: (p: number) => void } | null>(null);

    const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

    const calculateHash = async (file: File): Promise<string> => {
        // Limit client-side hashing to 1GB to prevent excessive performance hit
        if (file.size > 1024 * 1024 * 1024) {
            return "";
        }

        try {
            // Dynamic import to avoid issues with SSR or initial load if WASM is heavy
            const { createBLAKE3 } = await import('hash-wasm');
            const hasher = await createBLAKE3();
            hasher.init();

            // Read in chunks to keep memory usage low
            const chunkSize = 10 * 1024 * 1024; // 10MB chunks
            let offset = 0;

            while (offset < file.size) {
                const chunk = file.slice(offset, offset + chunkSize);
                const buffer = await chunk.arrayBuffer();
                hasher.update(new Uint8Array(buffer));
                offset += chunkSize;
            }

            return hasher.digest();
        } catch (err) {
            console.error("Hashing failed:", err);
            return "";
        }
    };

    const performUpload = async (file: File, folderId: string, onProgress?: (p: number) => void, totalSize?: number) => {
        // 1. Calculate hash for deduplication
        let hash = "";
        try {
            hash = await calculateHash(file);
        } catch (e) {
            console.warn("Hash calculation skipped/failed", e);
        }

        // 2. Pre-check if file exists (only if we have a hash)
        let preCheck = { exists: false, file_id: null };
        if (hash) {
            preCheck = await api.preCheck(hash, file.size);
        }

        if (preCheck.exists && preCheck.file_id) {
            // 3. Link existing file instead of uploading (saves bandwidth!)
            await api.linkFile(preCheck.file_id as string, file.name, folderId);
            if (onProgress) onProgress(100);
        } else {
            // 4. Upload new file
            await api.uploadFile(file, folderId, onProgress, totalSize);
        }
    };

    const [activeUploads, setActiveUploads] = useState<UploadStatus[]>([]);

    const ensureFolderExists = async (path: string, rootId: string, cache: Map<string, string>): Promise<string> => {
        if (!path || path === "" || path === ".") return rootId;
        const cacheKey = `${rootId}:${path}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey) || rootId;

        const parts = path.split('/').filter(p => p !== "");
        let currentParentId = rootId;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;

            const currentPath = parts.slice(0, i + 1).join('/');
            const subCacheKey = `${rootId}:${currentPath}`;

            if (cache.has(subCacheKey)) {
                currentParentId = cache.get(subCacheKey) || currentParentId;
                continue;
            }

            try {
                // Try to create the folder
                const res = await api.createFolder(part, currentParentId === "0" ? undefined : currentParentId);
                if (res && res.id) {
                    currentParentId = res.id;
                }
            } catch (err: any) {
                // If creation fails (most likely folder exists), find its ID
                // Check if the currentParentId is "0", which means we look in the root
                const effectiveParentId = currentParentId === "0" ? undefined : currentParentId;
                const files = await api.listFiles(effectiveParentId as any);

                // Check for folder match, being careful with null vs undefined vs "0"
                const existing = files.find((f: any) => {
                    // Try strict match first, then case-insensitive to handle FS differences
                    const safePart = part || "";
                    const isNameMatch = f.filename === part || f.filename.toLowerCase() === safePart.toLowerCase();
                    const isFolder = f.is_folder;
                    const parentMatch = (!f.parent_id && !effectiveParentId) ||
                        (f.parent_id === effectiveParentId) ||
                        (f.parent_id === "0" && !effectiveParentId) ||
                        (!f.parent_id && effectiveParentId === "0");
                    return isNameMatch && isFolder && parentMatch;
                });

                if (existing) {
                    currentParentId = existing.id;
                } else {
                    console.error(`Folder "${part}" not found in parent ${currentParentId} after failure.`, {
                        part,
                        parentId: currentParentId,
                        filesInParent: files.map((f: any) => ({ name: f.filename, id: f.id, isFolder: f.is_folder }))
                    });
                    throw err;
                }
            }
            cache.set(subCacheKey, currentParentId);
        }
        return currentParentId;
    };



    const onUpload = async (files: { file: File, path: string }[], folderId: string) => {
        if (files.length === 0) return;

        const statusItems = files.map(f => ({
            id: Math.random().toString(36).substring(7),
            name: f.path,
            progress: 0,
            status: 'uploading' as const,
            size: f.file.size
        }));
        setActiveUploads(prev => [...prev, ...statusItems]);

        const updateStatus = (id: string, progress: number, status: 'uploading' | 'completed' | 'error', error?: string) => {
            setActiveUploads(prev => prev.map(u =>
                u.id === id ? { ...u, progress, status, error } : u
            ));
        };

        const uploadQueue = files.map((f, i) => ({ ...f, id: statusItems[i]?.id || Math.random().toString(36).substring(7) }));
        const CONCURRENCY = 3;
        const folderCache = new Map<string, string>();

        // Pre-create all folders first to ensure structure exists before files are uploaded
        const uniqueFolders = Array.from(new Set(uploadQueue.map(item => {
            const pathParts = item.path.split('/');
            pathParts.pop();
            return pathParts.join('/');
        }))).sort((a, b) => a.length - b.length);

        for (const relPath of uniqueFolders) {
            try {
                if (relPath && relPath !== "." && relPath !== "/") {
                    await ensureFolderExists(relPath, folderId, folderCache);
                }
            } catch (err) {
                console.error(`Failed to pre-create folder structure for "${relPath}":`, err);
            }
        }
        const worker = async () => {
            while (uploadQueue.length > 0) {
                const item = uploadQueue.shift();
                if (!item) continue;

                const { file, path, id } = item;
                const pathParts = path.split('/');
                const fileName = pathParts.pop() || file.name;
                const relativeFolderPath = pathParts.join('/');

                try {
                    // 0. Client-side validation
                    const restriction = isRestrictedFile(fileName);
                    if (restriction.restricted) {
                        updateStatus(id, 0, 'error', restriction.reason);
                        continue;
                    }

                    // targetFolderId should now be in the cache from the pre-pass
                    const targetFolderId = await ensureFolderExists(relativeFolderPath, folderId, folderCache);

                    if (file.size > MAX_FILE_SIZE) {
                        updateStatus(id, 0, 'error', 'File too large');
                        continue;
                    }

                    const hash = await calculateHash(file);

                    // Check if file with same name exists in the target folder
                    const existingInFolder = fsRef.current.find(f =>
                        f.name === fileName &&
                        !f.isDir &&
                        (f.parentId === (targetFolderId === "0" ? "0" : targetFolderId))
                    );

                    if (existingInFolder) {
                        if (existingInFolder.hash === hash) {
                            // Same name + same hash -> skip
                            updateStatus(id, 100, 'completed', 'File already exists');
                            continue;
                        } else {
                            // Same name + different hash -> prompt
                            const overwrite = window.confirm(`File "${fileName}" already exists with different content. Overwrite?`);
                            if (!overwrite) {
                                updateStatus(id, 0, 'error', 'Upload cancelled (duplicate name)');
                                continue;
                            }
                        }
                    }

                    let preCheck = { exists: false, file_id: null };

                    if (hash) {
                        try {
                            preCheck = await api.preCheck(hash, file.size);
                        } catch (e) {
                            console.warn("Pre-check failed", e);
                        }
                    }

                    if (preCheck.exists && preCheck.file_id) {
                        await api.linkFile(preCheck.file_id as string, fileName, targetFolderId as any);
                        updateStatus(id, 100, 'completed');
                    } else {
                        await api.uploadFile(file, targetFolderId as any, (p) => {
                            updateStatus(id, p, 'uploading');
                        });
                        updateStatus(id, 100, 'completed');
                    }
                    // Refresh the file list immediately after each success, silently
                    if (targetFolderId === folderId) {
                        fetchFiles(folderId, true).catch(console.error);
                    }
                } catch (err: any) {
                    console.error(`Failed to upload ${path}:`, err);
                    updateStatus(id, 0, 'error', err.message);
                }

            }
        };

        // Start workers
        const workers = [];
        const numWorkers = Math.min(CONCURRENCY, files.length);
        for (let i = 0; i < numWorkers; i++) {
            workers.push(worker());
        }
        await Promise.all(workers);


        await fetchFiles(folderId);
        fetchUserFacts();

        // Clean up completed uploads after a delay
        setTimeout(() => {
            setActiveUploads(prev => prev.filter(u => u.status === 'uploading' || u.status === 'error'));
        }, 5000);
    };


    const onCreateFolder = async (name: string) => {
        try {
            const parentId = currentFolder === "0" ? undefined : currentFolder;
            await api.createFolder(name, parentId as any);
            await fetchFiles(currentFolder);
            fetchUserFacts();
        } catch (err: any) {
            alert(formatFriendlyError(err.message));
        }
    };

    const onDelete = async (id: string) => {
        if (id === "0") return;
        try {
            await api.deleteItem(id);
            if (currentFolder === id) {
                const folder = fs.find(f => f.id === id);
                const targetFolder = folder?.parentId || "0";
                setCurrentFolder(targetFolder);
                await fetchFiles(targetFolder);
            } else {
                await fetchFiles(currentFolder);
            }
            fetchUserFacts();
        } catch (err: any) {
            alert(formatFriendlyError(err.message));
        }
    };

    const onBulkDelete = async (ids: string[]) => {
        try {
            await api.bulkDeleteItem(ids);
            await fetchFiles(currentFolder);
            fetchUserFacts();
        } catch (err: any) {
            alert(formatFriendlyError(err.message));
        }
    };

    const onMove = async (id: string, newParentId: string) => {
        try {
            await api.renameItem(id, undefined, newParentId);
            await fetchFiles(currentFolder);
            if (newParentId !== currentFolder) {
                await fetchFiles(newParentId, true);
            }
            fetchUserFacts();
        } catch (err: any) {
            alert(formatFriendlyError(err.message));
        }
    };

    const onBulkMove = async (ids: string[], newParentId: string) => {
        try {
            await api.bulkMove(ids, newParentId);
            await fetchFiles(currentFolder);
            if (newParentId !== currentFolder) {
                await fetchFiles(newParentId, true);
            }
            fetchUserFacts();
        } catch (err: any) {
            alert(formatFriendlyError(err.message));
        }
    };

    const onRename = async (id: string, newName: string) => {
        try {
            await api.renameItem(id, newName);
            const item = fs.find(f => f.id === id);
            const parentId = item?.parentId || "0";
            await fetchFiles(parentId);
            if (currentFolder === id) {
                await fetchFiles(id);
            }
            fetchUserFacts();
        } catch (err: any) {
            alert(formatFriendlyError(err.message));
        }
    };

    if (!isAuthenticated) {
        return (
            <div
                className={`auth-container ${bgLoaded ? 'bg-visible' : ''}`}
                style={bgImage ? { backgroundImage: `url(${bgImage})` } : {}}
            >
                <div className="auth-card">
                    <h1>🚀 Enterprise File Manager</h1>
                    <p>Secure, Fast, Reliable</p>
                    <form onSubmit={handleLogin}>
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                        {error && <div className="error">{error}</div>}
                        <div className="auth-buttons">
                            <button type="submit" className="login-btn" disabled={authLoading}>
                                {authLoading ? "Logging in..." : "Login"}
                            </button>
                            <button type="button" onClick={handleRegister} className="register-btn" disabled={authLoading}>
                                {authLoading ? <div className="spinner-small"></div> : "Register"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="logo">🚀 File Manager</div>
                <div className="user-info">
                    <div className="user-dropdown-container" onClick={() => setDropdownVisible(!dropdownVisible)}>
                        <div className="user-avatar">
                            {profile.avatarUrl ? (
                                <img src={profile.avatarUrl} alt="Avatar" />
                            ) : (
                                (profile.name || username).charAt(0).toUpperCase()
                            )}
                        </div>
                        <span>{profile.name || username}</span>
                        {dropdownVisible && (
                            <div className="dropdown-menu">
                                <button className="dropdown-item" onClick={(e) => {
                                    setModalPosition({ x: e.clientX, y: e.clientY });
                                    setProfileModalVisible(true);
                                }}>
                                    👤 User Profile
                                </button>
                                <div className="dropdown-divider"></div>
                                <div className="dropdown-item theme-toggle" onClick={(e) => { e.stopPropagation(); toggleTheme(); setDropdownVisible(false); }}>
                                    <span>{theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}</span>
                                    <div className={`w-8 h-4 rounded-full relative transition-colors ${theme === "dark" ? "bg-indigo-600" : "bg-slate-300"}`}>
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${theme === "dark" ? "left-4.5" : "left-0.5"}`}></div>
                                    </div>
                                </div>
                                <div className="dropdown-divider"></div>
                                <button className="dropdown-item text-rose-500" onClick={handleLogout}>
                                    🚪 Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            <main className="container">
                {loading && <div className="loading-overlay">Loading...</div>}
                <ReactFileManager
                    fs={fs}
                    onRefresh={onRefresh}
                    onUpload={onUpload}
                    onCreateFolder={onCreateFolder}
                    onDelete={onDelete}
                    onBulkDelete={onBulkDelete}
                    onMove={onMove}
                    onBulkMove={onBulkMove}
                    onRename={onRename}
                    currentFolder={currentFolder}
                    setCurrentFolder={setCurrentFolder}
                    activeUploads={activeUploads}
                    setActiveUploads={setActiveUploads}
                    userFacts={userFacts}
                />

                <CommonModal
                    isVisible={!!pendingUpload}
                    title="Duplicate Filename"
                    onClose={() => setPendingUpload(null)}
                >
                    <div style={{ padding: '20px', textAlign: 'center' }}>
                        <p>A file named <strong>{pendingUpload?.file.name}</strong> already exists in this folder.</p>
                        <p>Do you want to upload it anyway as a new file?</p>
                        <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button
                                className="rfm-btn-primary"
                                onClick={() => pendingUpload && performUpload(pendingUpload.file, pendingUpload.folderId, pendingUpload.onProgress)}
                            >
                                Yes, Upload
                            </button>
                            <button
                                className="register-btn"
                                style={{ backgroundColor: '#64748b' }}
                                onClick={() => setPendingUpload(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </CommonModal>

                <CommonModal
                    isVisible={profileModalVisible}
                    title="User Profile"
                    onClose={() => setProfileModalVisible(false)}
                    centered={!modalPosition}
                    clickPosition={modalPosition}
                    autoHeight
                >
                    <div style={{ padding: '20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            <div
                                className="profile-avatar-editable"
                                onClick={() => document.getElementById('avatar-input')?.click()}
                            >
                                {profile.avatarUrl ? (
                                    <img src={profile.avatarUrl} alt="Avatar" />
                                ) : (
                                    (profile.name || username).charAt(0).toUpperCase()
                                )}
                                <div className="profile-avatar-overlay">Change</div>
                            </div>
                            <input type="file" id="avatar-input" hidden accept="image/*" onChange={handleAvatarChange} />

                            <div style={{ width: '100%' }}>
                                <label className="profile-label">USERNAME</label>
                                <div style={{ padding: '10px', background: 'var(--bg)', borderRadius: '5px', border: '1px solid var(--border)', opacity: 0.7 }}>
                                    {username}
                                </div>
                            </div>

                            <div style={{ width: '100%' }}>
                                <label className="profile-label">FULL NAME</label>
                                <input
                                    type="text"
                                    className="rfm-new-folder-modal-input"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    placeholder="Enter full name"
                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ width: '100%' }}>
                                <label className="profile-label">EMAIL</label>
                                <input
                                    type="email"
                                    className="rfm-new-folder-modal-input"
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    placeholder="Enter email address"
                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ width: '100%' }}>
                                <label className="profile-label">NEW PASSWORD</label>
                                <input
                                    type="password"
                                    className="rfm-new-folder-modal-input"
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    placeholder="Leave blank to keep current"
                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                <button
                                    className="rfm-btn-primary"
                                    style={{ flex: 1 }}
                                    onClick={handleSaveProfile}
                                >
                                    Save Changes
                                </button>
                                <button
                                    className="register-btn"
                                    style={{ flex: 1, backgroundColor: '#64748b' }}
                                    onClick={() => setProfileModalVisible(false)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>

                </CommonModal>
            </main>
        </div>
    );
}

export default App;
