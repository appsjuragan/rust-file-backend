import React, { useEffect, useState, useCallback, useRef } from "react";
import { ReactFileManager } from "../../../lib";
import { fileService } from "../../services/fileService";
import { userService } from "../../services/userService";
import { formatFriendlyError } from "../../utils/errorFormatter";
import type { FileSystemType, FileType } from "../../../lib/types";
import "./Dashboard.css";

// Components
import { DashboardHeader } from "./components/Header/DashboardHeader";
import { ProfileModal } from "./components/Modals/ProfileModal";
import { OverwriteConfirmModal } from "./components/Modals/OverwriteConfirmModal";

// Hooks
import { useFileUpload } from "./hooks/useFileUpload";

interface DashboardProps {
    onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
    const [fs, setFs] = useState<FileSystemType>([]);
    const [loading, setLoading] = useState(false);
    const [currentFolder, setCurrentFolder] = useState<string>(() => {
        return localStorage.getItem("currentFolder") || "0";
    });

    // User Profile State
    const [profile, setProfile] = useState<{ id: string, name?: string, email?: string, avatarUrl?: string }>({ id: "", name: "", email: "", avatarUrl: "" });
    const [username, setUsername] = useState(localStorage.getItem("username") || "User");
    const [userFacts, setUserFacts] = useState<any>(null);

    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchSuggestions, setSearchSuggestions] = useState<FileType[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Pagination State
    const [hasMoreFiles, setHasMoreFiles] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // UI State
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
    const [dropdownVisible, setDropdownVisible] = useState(false);

    // Modals
    const [profileModalVisible, setProfileModalVisible] = useState(false);
    const [editName, setEditName] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editPassword, setEditPassword] = useState("");

    const [cropModalVisible, setCropModalVisible] = useState(false);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);

    // Refs
    const validationRulesRef = useRef<any>(null);
    const fsRef = useRef(fs);
    const currentFolderRef = useRef(currentFolder);
    const alertedInfectedFiles = useRef<Set<string>>(new Set());
    const scanningFilesRef = useRef<Set<string>>(new Set());

    // Sync Refs
    useEffect(() => { fsRef.current = fs; }, [fs]);
    useEffect(() => { currentFolderRef.current = currentFolder; }, [currentFolder]);

    // Data Fetching
    const fetchValidationRules = useCallback(async () => {
        if (validationRulesRef.current) return validationRulesRef.current;
        try {
            const rules = await userService.getSettings();
            validationRulesRef.current = {};
            return {};
        } catch (e) { return {}; }
    }, []);

    const fetchProfile = useCallback(async () => {
        try {
            const data = await userService.getProfile();
            const BASE = import.meta.env.VITE_API_URL || "/api";
            // Check if avatar_url is absolute or relative
            const avatar = data.avatar_url
                ? (data.avatar_url.startsWith('http') ? data.avatar_url : (data.avatar_url.startsWith('/') ? `${BASE}${data.avatar_url}` : userService.getAvatar(data.id)))
                : undefined;

            setProfile({
                id: data.id,
                name: data.full_name,
                email: data.email,
                avatarUrl: avatar
            });

            // Pre-fill edit fields
            setEditName(data.full_name || "");
            setEditEmail(data.email || "");

            if (data.username) setUsername(data.username);
        } catch (err) { console.error("Failed to fetch profile", err); }
    }, []);

    const fetchUserFacts = useCallback(async () => {
        try {
            const facts = await userService.getUserFacts();
            setUserFacts(facts);
        } catch (err) { console.error("Failed to fetch user facts", err); }
    }, []);

    const fetchFiles = useCallback(async (parentId: string = "0", silent = false, offset = 0) => {
        if (!silent && offset === 0) setLoading(true);
        if (offset > 0) setLoadingMore(true);

        try {
            const limit = 50;
            // Handle effective parent ID logic
            let effectiveParentId = parentId;
            // Additional verification logic could go here

            const data = await fileService.listFiles(effectiveParentId === "0" ? undefined : effectiveParentId, limit, offset);

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

            setHasMoreFiles(data.length === limit);

            setFs((prevFs: FileSystemType) => {
                let newFs;
                if (offset === 0) {
                    newFs = prevFs.filter(f => (f.parentId || "0") !== effectiveParentId && f.id !== "0");
                } else {
                    newFs = [...prevFs];
                }

                const existingIds = new Set(newFs.map(f => f.id));
                const uniqueNewItems = mappedFs.filter(f => !existingIds.has(f.id));
                newFs = [...newFs, ...uniqueNewItems];

                if (!newFs.some(f => f.id === "0")) {
                    newFs.unshift({ id: "0", name: "/", isDir: true, path: "/" });
                }
                return newFs;
            });
        } catch (err: any) {
            console.error("Failed to fetch files:", err);
        } finally {
            if (!silent) setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    // Search Effect
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.trim().length > 2) {
                setIsSearching(true);
                try {
                    const results = await fileService.searchFiles({ q: searchQuery, limit: 10 });
                    const mappedResults: FileType[] = results.map((item: any) => ({
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
                        path: item.path
                    }));
                    setSearchSuggestions(mappedResults);
                } catch (error) {
                    console.error("Search failed", error);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchSuggestions([]);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Hooks Usage (must be after fetchFiles definition)
    const { activeUploads, setActiveUploads, onUpload, overwriteConfirm, setOverwriteConfirm } = useFileUpload(fetchFiles, fsRef);

    // Initial Load & Auth Effects
    useEffect(() => {
        localStorage.setItem("currentFolder", currentFolder);
        userService.getSettings().then((settings: any) => {
            if (settings && settings.theme) setTheme(settings.theme);
        }).catch(console.error);

        fetchProfile();
        fetchUserFacts();
        fetchValidationRules();
        fetchFiles(currentFolder);
    }, [currentFolder, fetchProfile, fetchUserFacts, fetchFiles, fetchValidationRules]);

    // Polling & Updates
    useEffect(() => {
        const interval = setInterval(fetchUserFacts, 60000);
        return () => clearInterval(interval);
    }, [fetchUserFacts]);

    // File Scanning Polling
    useEffect(() => {
        const interval = setInterval(() => {
            const currentFs = fsRef.current;
            const activeScans = currentFs.filter(f => f.scanStatus === 'pending' || f.scanStatus === 'scanning');

            if (activeScans.length > 0) {
                fetchFiles(currentFolderRef.current, true);
            }

            const currentScanningIds = new Set(activeScans.map(f => f.id));
            scanningFilesRef.current.forEach(id => {
                if (!currentScanningIds.has(id)) {
                    scanningFilesRef.current.delete(id);
                }
            });
            activeScans.forEach(f => scanningFilesRef.current.add(f.id));

            const infectedFiles = currentFs.filter(f => f.scanStatus === 'infected');
            const newInfectedFiles = infectedFiles.filter(f => !alertedInfectedFiles.current.has(f.id));

            if (newInfectedFiles.length > 0) {
                newInfectedFiles.forEach(f => {
                    alert(`🚨 MALWARE DETECTED: The file "${f.name}" has been flagged as infected and will be deleted.`);
                    alertedInfectedFiles.current.add(f.id);
                });
                fetchFiles(currentFolderRef.current, true);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [fetchFiles]);

    // Theme Effect
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        if (theme === "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }, [theme]);

    // Handlers
    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light";
        setTheme(newTheme);
        userService.updateSettings({ theme: newTheme }).catch(console.error);
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.addEventListener("load", () => {
                setImageToCrop(reader.result as string);
                setCropModalVisible(true);
            });
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleSaveProfile = async () => {
        try {
            await userService.updateProfile({
                name: editName || undefined,
                email: editEmail || undefined,
                password: editPassword || undefined
            });
            await fetchProfile();
            setProfileModalVisible(false);
        } catch (err: any) {
            alert(formatFriendlyError(err.message));
        }
    };

    const handleCropSave = async (croppedBlob: Blob) => {
        try {
            const file = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" });
            await userService.uploadAvatar(file);
            await fetchProfile();
            setCropModalVisible(false);
            setImageToCrop(null);
        } catch (err: any) {
            alert(formatFriendlyError(err.message));
        }
    };

    return (
        <div className="app-container">
            <DashboardHeader
                profile={profile}
                username={username}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                dropdownVisible={dropdownVisible}
                setDropdownVisible={setDropdownVisible}
                setProfileModalVisible={setProfileModalVisible}
                theme={theme}
                toggleTheme={toggleTheme}
                onLogout={onLogout}
                searchSuggestions={searchSuggestions}
                isSearching={isSearching}
                onSearchResultClick={(file) => {
                    if (file.isDir) {
                        setCurrentFolder(file.id);
                    } else {
                        if (file.parentId) {
                            setCurrentFolder(file.parentId);
                            setHighlightedId(file.id);
                        }
                    }
                }}
            />

            <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <ReactFileManager
                    fs={fs}
                    onRefresh={(id: string) => fetchFiles(id)}
                    setCurrentFolder={setCurrentFolder}
                    currentFolder={currentFolder}
                    onUpload={onUpload}
                    onCreateFolder={async (n: string) => { await fileService.createFolder(n, currentFolder === "0" ? undefined : currentFolder); fetchFiles(currentFolder); }}
                    onDelete={async (id: string) => { await fileService.deleteItem(id); fetchFiles(currentFolder); }}
                    onBulkDelete={async (ids: string[]) => { await fileService.bulkDeleteItem(ids); fetchFiles(currentFolder); }}
                    onRename={async (id: string, n: string) => { await fileService.renameItem(id, n); fetchFiles(currentFolder); }}
                    onMove={async (id: string, pid: string) => { await fileService.renameItem(id, undefined, pid); fetchFiles(currentFolder); }}
                    onBulkMove={async (ids: string[], pid: string) => { await fileService.bulkMove(ids, pid); fetchFiles(currentFolder); }}
                    activeUploads={activeUploads}
                    setActiveUploads={setActiveUploads}
                    userFacts={userFacts}
                    onLoadMore={async () => {
                        const count = fs.filter(f => (f.parentId || "0") === currentFolder).length;
                        await fetchFiles(currentFolder, true, count);
                    }}
                    hasMore={hasMoreFiles}
                    isLoadingMore={loadingMore}
                    highlightedId={highlightedId}
                    setHighlightedId={setHighlightedId}
                />
            </main>

            <ProfileModal
                isVisible={profileModalVisible}
                onClose={() => setProfileModalVisible(false)}
                profile={profile}
                username={username}
                editName={editName}
                setEditName={setEditName}
                editEmail={editEmail}
                setEditEmail={setEditEmail}
                editPassword={editPassword}
                setEditPassword={setEditPassword}
                onSave={handleSaveProfile}
                onAvatarChange={handleAvatarChange}
            />

            {overwriteConfirm && (
                <OverwriteConfirmModal
                    isVisible={!!overwriteConfirm}
                    fileName={overwriteConfirm.fileName}
                    onCancel={() => {
                        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                        overwriteConfirm.resolve(false);
                        setOverwriteConfirm(null);
                    }}
                    onConfirm={() => {
                        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                        overwriteConfirm.resolve(true);
                        setOverwriteConfirm(null);
                    }}
                />
            )}

            {imageToCrop && (
                <AvatarCropModal
                    isVisible={cropModalVisible}
                    imageSrc={imageToCrop}
                    onClose={() => setCropModalVisible(false)}
                    onCropComplete={handleCropSave}
                />
            )}
        </div>
    );
}
