import { useState, useCallback, useEffect, useRef } from 'react';
import { UploadStatus, FileSystemType } from '../../../../lib/types';
import { fileService } from '../../../services/fileService';
import { uploadService } from '../../../services/uploadService';
import { request } from '../../../services/httpClient';
import { storeFileForUpload, cleanupUpload, getAllUploadMeta } from '../../../services/uploadDb';

export const useFileUpload = (
    refreshFiles: (folderId: string, silent?: boolean) => Promise<void>,
    currentFilesRef: React.MutableRefObject<FileSystemType>,
    chunkSize: number = 7 * 1024 * 1024 // Default fallback
) => {
    const [activeUploads, setActiveUploads] = useState<UploadStatus[]>([]);
    const [overwriteConfirm, setOverwriteConfirm] = useState<{ fileName: string, resolve: (v: boolean) => void } | null>(null);
    const resumeAttempted = useRef(false);

    // Warn user before leaving/refreshing if uploads are in progress
    useEffect(() => {
        const hasActiveUploads = activeUploads.some(
            u => u.status === 'uploading' || u.status === 'hashing' || u.status === 'processing' || u.status === 'queued'
        );

        if (!hasActiveUploads) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = 'You have uploads in progress. If you leave, they will be lost.';
            return e.returnValue;
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [activeUploads]);

    // Resume pending uploads on mount
    useEffect(() => {
        if (resumeAttempted.current) return;
        resumeAttempted.current = true;

        const resumePendingUploads = async () => {
            try {
                // 1. Check backend for pending sessions
                const sessions = await uploadService.listPendingSessions();
                if (!sessions || sessions.length === 0) return;

                // 2. Check IndexedDB for matching file data
                const localMeta = await getAllUploadMeta();
                const localMetaMap = new Map(localMeta.map(m => [m.id, m.meta]));

                const resumable = sessions.filter((s: any) => localMetaMap.has(s.upload_id));

                if (resumable.length === 0) {
                    console.log('[Resume] No resumable uploads found (no matching local data).');
                    return;
                }

                console.log(`[Resume] Found ${resumable.length} resumable upload(s). Resuming...`);

                // 3. Create status entries for each resumable session
                const statusItems: UploadStatus[] = resumable.map((s: any) => ({
                    id: s.upload_id,
                    name: `↻ ${s.file_name}`,
                    progress: Math.round((s.uploaded_chunks / s.total_chunks) * 99),
                    status: 'uploading' as const,
                    size: s.total_size,
                    uploadId: s.upload_id,
                }));

                setActiveUploads(prev => [...prev, ...statusItems]);

                // 4. Resume each upload
                for (const session of resumable) {
                    const meta = localMetaMap.get(session.upload_id)!;
                    const uploadId = session.upload_id;

                    const updateStatus = (progress: number, status: any, error?: string) => {
                        setActiveUploads(prev => prev.map(u =>
                            u.id === uploadId ? { ...u, progress, status, error } : u
                        ));
                    };

                    try {
                        await uploadService.resumeChunkedUpload(
                            uploadId,
                            session.total_size,
                            session.chunk_size,
                            session.total_chunks,
                            session.uploaded_parts || [],
                            meta.parentId,
                            (p) => updateStatus(p, p === 100 ? 'processing' : 'uploading'),
                        );

                        updateStatus(100, 'completed');
                        await cleanupUpload(uploadId, session.total_chunks);
                        refreshFiles(meta.parentId || '0', true);
                    } catch (e: any) {
                        console.error('[Resume] Failed to resume', session.file_name, ":", e);
                        updateStatus(0, 'error', e.message || 'service error');
                    }
                }

                // Cleanup completed after delay
                setTimeout(() => {
                    setActiveUploads(prev => prev.filter(u => u.status === 'uploading' || u.status === 'error'));
                }, 5000);
            } catch (err) {
                console.error('[Resume] Failed to check for pending uploads:', err);
            }
        };

        resumePendingUploads();
    }, [refreshFiles]);

    const calculateHash = useCallback(async (file: File, onProgress?: (p: number) => void): Promise<string> => {
        if (file.size > 1024 * 1024 * 1024) return "";
        try {
            const { createXXHash128 } = await import('hash-wasm');
            const hasher = await createXXHash128();
            hasher.init();

            let offset = 0;
            while (offset < file.size) {
                const chunk = file.slice(offset, offset + chunkSize);
                const buffer = await chunk.arrayBuffer();
                hasher.update(new Uint8Array(buffer));
                offset += chunkSize;
                if (onProgress) onProgress(Math.min(100, Math.round((offset / file.size) * 100)));

                // Yield to main thread to prevent UI freezing
                await new Promise(resolve => setTimeout(resolve, 0));
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
            const THRESHOLD = 90 * 1024 * 1024;

            // For large files (chunked), store in IndexedDB first for resumability
            if (file.size > THRESHOLD) {
                // Init the upload session first
                const initRes = await request('/files/upload/init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file_name: file.name,
                        file_type: file.type || 'application/octet-stream',
                        total_size: file.size,
                    }),
                });

                const { upload_id, chunk_size: serverChunkSize } = initRes;

                // Track server uploadId specifically for cancellation
                setActiveUploads(prev => prev.map(u => u.name === file.name && u.status === 'hashing' ? { ...u, uploadId: upload_id } : u));

                const effectiveChunkSize = serverChunkSize || chunkSize;
                const totalChunks = Math.ceil(file.size / effectiveChunkSize);

                // Store file data in IndexedDB for resume capability
                try {
                    await storeFileForUpload(upload_id, file, {
                        uploadId: upload_id,
                        fileName: file.name,
                        fileType: file.type || 'application/octet-stream',
                        totalSize: file.size,
                        chunkSize: effectiveChunkSize,
                        totalChunks,
                        parentId: folderId,
                        createdAt: Date.now(),
                    });
                    console.log(`[Upload] Stored ${file.name} in IndexedDB for resume (${totalChunks} chunks)`);
                } catch (e) {
                    console.warn('[Upload] Failed to store in IndexedDB, upload will not be resumable:', e);
                }

                // Now resume (which handles uploading all remaining chunks)
                await uploadService.resumeChunkedUpload(
                    upload_id,
                    file.size,
                    effectiveChunkSize,
                    totalChunks,
                    [], // no parts uploaded yet
                    folderId,
                    onProgress,
                    hash,
                );

                // Cleanup IndexedDB on success
                await cleanupUpload(upload_id, totalChunks);
            } else {
                // Small files: direct upload (not resumable, but fast)
                await uploadService.uploadFile(file, folderId, onProgress);
            }
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

        const statusItems = files.map(f => {
            const cleanPath = f.path.startsWith("./") ? f.path.slice(2) : f.path;
            return {
                id: Math.random().toString(36).substring(7),
                name: cleanPath,
                progress: 0,
                status: 'queued' as const,
                size: f.file.size
            };
        });
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

                // Add a small delay to ensure UI updates are rendered
                await new Promise(r => setTimeout(r, 50));

                try {
                    const targetFolderId = await ensureFolderExists(relativeFolderPath, folderId, folderCache);
                    updateStatus(id, 0, 'hashing');

                    // Yield again to allow 'hashing' status to render
                    await new Promise(r => setTimeout(r, 10));

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
                            // Non-blocking confirm dialog (handled via state in Dashboard)
                            updateStatus(id, 0, 'processing', 'Waiting for confirmation...');
                            const shouldOverwrite = await new Promise<boolean>((resolve) => {
                                setOverwriteConfirm({ fileName, resolve });
                            });

                            setOverwriteConfirm(null);

                            if (!shouldOverwrite) {
                                // If cancelled, remove from active uploads or mark error
                                updateStatus(id, 0, 'error', 'Cancelled');
                                // Determine if we want to remove it:
                                // setActiveUploads(prev => prev.filter(u => u.id !== id));
                                continue;
                            }
                        }
                    }

                    updateStatus(id, 0, 'uploading');
                    await performUpload(file, targetFolderId, (p) => updateStatus(id, p, p === 100 ? 'processing' : 'uploading'), hash);
                    updateStatus(id, 100, 'completed');
                    if (targetFolderId === folderId) refreshFiles(folderId, true);
                } catch (err: any) {
                    console.error(`[Upload] Error uploading ${fileName}:`, err);
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

    const cancelUpload = useCallback(async (id: string) => {
        const upload = activeUploads.find(u => u.id === id);
        if (!upload) return;

        console.log(`[Upload] Cancelling upload ${upload.name} (${id})`);

        if (upload.uploadId) {
            try {
                await uploadService.abortUpload(upload.uploadId);
                await cleanupUpload(upload.uploadId, 0); // Cleanup any IDB data
            } catch (e) {
                console.error('[Upload] Failed to abort server session:', e);
            }
        }

        setActiveUploads(prev => prev.filter(u => u.id !== id));
    }, [activeUploads, setActiveUploads]);

    return {
        activeUploads,
        setActiveUploads,
        onUpload,
        cancelUpload,
        overwriteConfirm,
        setOverwriteConfirm
    };
};
