import React, { useEffect, useState, useCallback } from "react";
import { ReactFileManager } from "../lib";
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

    const fetchFiles = useCallback(async (parentId?: string) => {
        setLoading(true);
        try {
            const data = await api.listFiles(parentId === "0" ? undefined : parentId);
            const mappedFs: FileSystemType = data.map((item: any) => ({
                id: item.id,
                name: item.filename,
                isDir: item.is_folder,
                parentId: item.parent_id || "0",
                lastModified: new Date(item.created_at).getTime() / 1000,
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
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            fetchFiles();
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

    const onUpload = async (fileData: any, folderId: string, onProgress?: (p: number) => void) => {
        // fileData is usually from an input or dropzone
        if (fileData && fileData[0]) {
            try {
                await api.uploadFile(fileData[0], folderId, onProgress);
                await fetchFiles(folderId);
            } catch (err: any) {
                alert("Upload failed: " + err.message);
            }
        }
    };

    const onCreateFolder = async (name: string) => {
        // Note: The component doesn't easily pass the current folder to onCreateFolder
        // We might need to track current folder in App state too
        try {
            // For now, assume root or track it
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
            </main>
        </div>
    );
}

export default App;
