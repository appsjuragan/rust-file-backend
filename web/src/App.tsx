import React, { useEffect, useState, useCallback } from "react";
import { ReactFileManager, CommonModal } from "../lib";
import { api, getAuthToken, setAuthToken, clearAuthToken } from "./api";
import type { FileSystemType, FileType } from "../lib/types";
import "./App.css";
import "../lib/tailwind.css";

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(!!getAuthToken());
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [fs, setFs] = useState<FileSystemType>([]);
    const [loading, setLoading] = useState(false);

    const fetchFiles = useCallback(async (parentId?: string, silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await api.listFiles(parentId === "0" ? undefined : parentId);
            const mappedFs: FileSystemType = data.map((item: any) => ({
                id: item.id,
                name: item.filename,
                isDir: item.is_folder,
                parentId: item.parent_id || "0",
                lastModified: new Date(item.created_at).getTime() / 1000,
                scanStatus: item.scan_status,
            }));

            // Ensure root is present if we are at root
            if (!parentId || parentId === "0") {
                const rootExists = mappedFs.some(f => f.id === "0");
                if (!rootExists) {
                    mappedFs.unshift({ id: "0", name: "/", isDir: true, path: "/" });
                }
            }

            setFs(mappedFs);
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

    useEffect(() => {
        if (isAuthenticated) {
            fetchFiles();

            // Poll every 5 seconds if there are pending files
            const interval = setInterval(() => {
                const currentFs = fsRef.current;
                const hasPending = currentFs.some(f => f.scanStatus === 'pending');
                if (hasPending) {
                    fetchFiles(undefined, true);
                }

                // Check for infected files to show toast/alert
                const infectedFiles = currentFs.filter(f => f.scanStatus === 'infected');
                if (infectedFiles.length > 0) {
                    infectedFiles.forEach(f => {
                        alert(`🚨 MALWARE DETECTED: The file "${f.name}" has been flagged as infected and will be deleted.`);
                    });
                    // Refresh after alert to show they are gone
                    fetchFiles(undefined, true);
                }
            }, 5000);

            return () => clearInterval(interval);
        }
    }, [isAuthenticated, fetchFiles]);

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

    const performUpload = async (file: File, folderId: string, onProgress?: (p: number) => void) => {
        try {
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
                await api.uploadFile(file, folderId, onProgress);
            }

            await fetchFiles(folderId);
        } catch (err: any) {
            alert("Upload failed: " + err.message);
        } finally {
            setPendingUpload(null);
        }
    };

    const onUpload = async (fileData: any, folderId: string, onProgress?: (p: number) => void) => {
        if (fileData && fileData[0]) {
            const file = fileData[0];

            if (file.size > MAX_FILE_SIZE) {
                alert(`❌ Upload failed: File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum allowed size is 256MB.`);
                return;
            }

            // Check for duplicate name in current folder
            const duplicate = fs.find(f => f.name === file.name && f.parentId === (folderId || "0") && !f.isDir);
            if (duplicate) {
                setPendingUpload({ file, folderId, onProgress });
                return;
            }

            await performUpload(file, folderId, onProgress);
        }
    };

    const onCreateFolder = async (name: string) => {
        try {
            await api.createFolder(name, "0");
            await fetchFiles("0");
        } catch (err: any) {
            alert("Create folder failed: " + err.message);
        }
    };

    const onDelete = async (id: string) => {
        if (id === "0") return;
        try {
            await api.deleteItem(id);
            await fetchFiles(); // Refresh all for simplicity
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
