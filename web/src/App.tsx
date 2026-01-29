import React, { useEffect, useState, useCallback } from "react";
import { ReactFileManager, CommonModal } from "../lib";
import { api, getAuthToken, setAuthToken, clearAuthToken } from "./api";
import type { FileSystemType, FileType } from "../lib/types";
import "./App.css";
import "../lib/tailwind.css";

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(!!getAuthToken());
    const [username, setUsername] = useState(() => localStorage.getItem("username") || "");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [fs, setFs] = useState<FileSystemType>([]);
    const [loading, setLoading] = useState(false);
    const [currentFolder, setCurrentFolder] = useState<string>(() => {
        return localStorage.getItem("currentFolder") || "0";
    });

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

    useEffect(() => {
        if (isAuthenticated) {
            localStorage.setItem("currentFolder", currentFolder);
            localStorage.setItem("username", username);
        }
    }, [currentFolder, username, isAuthenticated]);

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
                extraMetadata: item.extra_metadata,
            }));

            setFs(prevFs => {
                // Remove existing items that belong to this parent to handle deletions
                let newFs = prevFs.filter(f => f.parentId !== effectiveParentId && f.id !== "0");

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
    }, []);

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

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            const res = await api.login({ username, password });
            setAuthToken(res.token);
            setIsAuthenticated(true);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            await api.register({ username, password });
            const res = await api.login({ username, password });
            setAuthToken(res.token);
            setIsAuthenticated(true);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleLogout = () => {
        clearAuthToken();
        setIsAuthenticated(false);
        setFs([]);
        setCurrentFolder("0");
        localStorage.removeItem("currentFolder");
        localStorage.removeItem("username");
        setUsername("");
    };

    const onRefresh = async (id: string) => {
        await fetchFiles(id);
    };

    const [pendingUpload, setPendingUpload] = useState<{ file: File, folderId: string, onProgress?: (p: number) => void } | null>(null);

    const MAX_FILE_SIZE = 256 * 1024 * 1024; // 256MB

    const calculateHash = async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    };

    const performUpload = async (file: File, folderId: string, onProgress?: (p: number) => void, totalSize?: number) => {
        // 1. Calculate hash for deduplication
        const hash = await calculateHash(file);

        // 2. Pre-check if file exists
        const preCheck = await api.preCheck(hash, file.size);

        if (preCheck.exists && preCheck.file_id) {
            // 3. Link existing file instead of uploading (saves bandwidth!)
            await api.linkFile(preCheck.file_id, file.name, folderId);
            if (onProgress) onProgress(100);
        } else {
            // 4. Upload new file
            await api.uploadFile(file, folderId, onProgress, totalSize);
        }
    };

    const onUpload = async (fileData: any, folderId: string, onProgress?: (p: number) => void) => {
        const files = Array.from(fileData) as File[];
        if (files.length === 0) return;

        const totalSize = files.reduce((acc, f) => acc + f.size, 0);
        let completedCount = 0;
        try {
            for (const file of files) {
                if (file.size > MAX_FILE_SIZE) {
                    alert(`❌ Upload failed: "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum allowed size is 256MB.`);
                    continue;
                }

                await performUpload(file, folderId, (p) => {
                    if (onProgress) {
                        const totalProgress = (completedCount * 100 + p) / files.length;
                        onProgress(totalProgress);
                    }
                }, totalSize);
                completedCount++;
            }
        } catch (err: any) {
            alert("Upload failed: " + err.message);
        } finally {
            await fetchFiles(folderId);
            setPendingUpload(null);
        }
    };

    const onCreateFolder = async (name: string) => {
        try {
            const parentId = currentFolder === "0" ? undefined : currentFolder;
            await api.createFolder(name, parentId);
            await fetchFiles(currentFolder);
        } catch (err: any) {
            alert("Create folder failed: " + err.message);
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
        } catch (err: any) {
            alert("Delete failed: " + err.message);
        }
    };

    const onMove = async (id: string, newParentId: string) => {
        try {
            await api.renameItem(id, undefined, newParentId);
            await fetchFiles(newParentId);
        } catch (err: any) {
            alert("Move failed: " + err.message);
        }
    };

    const onRename = async (id: string, newName: string) => {
        try {
            await api.renameItem(id, newName);
            await fetchFiles(currentFolder);
        } catch (err: any) {
            alert("Rename failed: " + err.message);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="auth-container">
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
                            <button type="submit" className="login-btn">Login</button>
                            <button type="button" onClick={handleRegister} className="register-btn">Register</button>
                        </div>
                        <div style={{ marginTop: '10px', textAlign: 'center' }}>
                            <button
                                type="button"
                                className="login-btn"
                                style={{ backgroundColor: '#4285F4', width: '100%' }}
                                onClick={() => window.location.href = 'http://127.0.0.1:3000/auth/oidc/login'}
                            >
                                Login with OIDC
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
                    <span>{username}</span>
                    <button onClick={handleLogout} className="logout-btn">Logout</button>
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
                    onMove={onMove}
                    onRename={onRename}
                    currentFolder={currentFolder}
                    setCurrentFolder={setCurrentFolder}
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
            </main>
        </div>
    );
}

export default App;
