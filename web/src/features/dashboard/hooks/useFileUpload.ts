import { useState, useCallback } from 'react';
import { UploadStatus, FileSystemType } from '../../../../lib/types';
import { fileService } from '../../../services/fileService';
import { uploadService } from '../../../services/uploadService';

export const useFileUpload = (
    refreshFiles: (folderId: string, silent?: boolean) => Promise<void>,
    currentFilesRef: React.MutableRefObject<FileSystemType>
) => {
    const [activeUploads, setActiveUploads] = useState<UploadStatus[]>([]);
    const [overwriteConfirm, setOverwriteConfirm] = useState<{ fileName: string, resolve: (v: boolean) => void } | null>(null);

    const calculateHash = useCallback(async (file: File, onProgress?: (p: number) => void): Promise<string> => {
        if (file.size > 1024 * 1024 * 1024) return "";
        try {
            const { createXXHash128 } = await import('hash-wasm');
            const hasher = await createXXHash128();
            hasher.init();
            const chunkSize = Number(import.meta.env.VITE_CHUNK_SIZE) || 7 * 1024 * 1024; // Default to 7MB if not set
            let offset = 0;
            while (offset < file.size) {
                const chunk = file.slice(offset, offset + chunkSize);
                const buffer = await chunk.arrayBuffer();
                hasher.update(new Uint8Array(buffer));
                offset += chunkSize;
                if (onProgress) onProgress(Math.min(100, Math.round((offset / file.size) * 100)));
            }
            const hashResult = hasher.digest();
            console.log(`[Hash Tool] Generated hash for ${file.name}: ${hashResult}`);
            return hashResult;
        } catch (err) {
            console.error(`[Hash Tool] Failed to hash ${file.name}:`, err);
            return "";
        }
    }, []);

    const performUpload = async (file: File, folderId: string, onProgress?: (p: number) => void, existingHash?: string) => {
        let hash = existingHash || "";
        if (!hash) {
            try { hash = await calculateHash(file); } catch (e) { }
        }

        let preCheck = { exists: false, file_id: null };
        if (hash) {
            try { preCheck = await fileService.preCheck(hash, file.size) as any; } catch (e) { }
        }

        if (preCheck.exists && preCheck.file_id) {
            await fileService.linkFile(preCheck.file_id as string, file.name, folderId);
            if (onProgress) onProgress(100);
        } else {
            await uploadService.uploadFile(file, folderId, onProgress);
        }
    };

    const ensureFolderExists = useCallback(async (path: string, rootId: string, cache: Map<string, string>): Promise<string> => {
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
                const res = await fileService.createFolder(part, currentParentId === "0" ? undefined : currentParentId) as any;
                if (res && res.id) currentParentId = res.id;
            } catch (err: any) {
                const files = await fileService.listFiles(currentParentId === "0" ? undefined : currentParentId);
                const existing = (files as any[]).find((f: any) => f.filename === part && f.is_folder);
                if (existing) currentParentId = existing.id;
                else throw err;
            }
            cache.set(subCacheKey, currentParentId);
        }
        return currentParentId;
    }, []);

    const onUpload = useCallback(async (files: { file: File, path: string }[], folderId: string) => {
        if (files.length === 0) return;

        const statusItems = files.map(f => ({
            id: Math.random().toString(36).substring(7),
            name: f.path,
            progress: 0,
            status: 'queued' as const,
            size: f.file.size
        }));
        setActiveUploads(prev => [...prev, ...statusItems]);

        const updateStatus = (id: string, progress: number, status: any, error?: string) => {
            setActiveUploads(prev => prev.map(u => u.id === id ? { ...u, progress, status, error } : u));
        };

        const uploadQueue = files.map((f, i) => ({ ...f, id: statusItems[i]!.id }));
        const CONCURRENCY = 3;
        const folderCache = new Map<string, string>();

        const worker = async () => {
            while (uploadQueue.length > 0) {
                const item = uploadQueue.shift();
                if (!item) continue;
                const { file, path, id } = item;
                const pathParts = path.split('/');
                const fileName = pathParts.pop() || file.name;
                const relativeFolderPath = pathParts.join('/');

                try {
                    const targetFolderId = await ensureFolderExists(relativeFolderPath, folderId, folderCache);
                    updateStatus(id, 0, 'hashing');

                    let hash = "";
                    try { hash = await calculateHash(file); } catch (e) { }

                    const existing = currentFilesRef.current.find(f => {
                        const normFParent = (!f.parentId || f.parentId === "0" || f.parentId === "root") ? "0" : f.parentId;
                        const normTargetParent = (!targetFolderId || targetFolderId === "0" || targetFolderId === "root") ? "0" : targetFolderId;
                        return f.name === fileName && !f.isDir && normFParent === normTargetParent;
                    });

                    if (existing) {
                        console.log(`[Upload] Found existing file: ${fileName}. Existing Hash: ${existing.hash}, New Hash: ${hash}`);
                        if (existing.hash && existing.hash === hash) {
                            console.log(`[Upload] Hashes match for ${fileName}, skipping everything.`);
                            updateStatus(id, 100, 'completed');
                            if (targetFolderId === folderId) refreshFiles(folderId, true);
                            continue;
                        } else {
                            const shouldOverwrite = await new Promise<boolean>((resolve) => {
                                setOverwriteConfirm({ fileName, resolve });
                            });

                            setOverwriteConfirm(null);

                            if (!shouldOverwrite) {
                                updateStatus(id, 0, 'error', 'Cancelled');
                                continue;
                            }
                        }
                    }

                    updateStatus(id, 0, 'uploading');
                    await performUpload(file, targetFolderId, (p) => updateStatus(id, p, p === 100 ? 'processing' : 'uploading'), hash);
                    updateStatus(id, 100, 'completed');
                    if (targetFolderId === folderId) refreshFiles(folderId, true);
                } catch (err: any) {
                    updateStatus(id, 0, 'error', err.message);
                }
            }
        };

        const workers = Array(Math.min(CONCURRENCY, files.length)).fill(null).map(() => worker());
        await Promise.all(workers);
        await refreshFiles(folderId);

        setTimeout(() => {
            setActiveUploads(prev => prev.filter(u => u.status === 'uploading' || u.status === 'error'));
        }, 5000);
    }, [ensureFolderExists, refreshFiles, calculateHash, currentFilesRef]);

    return {
        activeUploads,
        setActiveUploads,
        onUpload,
        overwriteConfirm,
        setOverwriteConfirm
    };
};
