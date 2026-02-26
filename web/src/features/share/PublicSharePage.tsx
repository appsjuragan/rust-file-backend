import React, { useState, useEffect, useCallback, useRef } from "react";
import { fileService } from "../../services/fileService";
import { formatSize } from "../../../lib/utils/fileUtils";
import { Download, Lock, File, AlertTriangle, Loader2, Folder, ChevronRight, Eye, ArrowLeft } from "lucide-react";
import ReactPlayer from "react-player";
import "./PublicSharePage.css";

interface PublicFileEntry {
    id: string;
    filename: string;
    is_folder: boolean;
    size?: number;
    mime_type?: string;
    created_at: string;
}

const MediaViewer: React.FC<{ info: any, token: string, fileId?: string }> = ({ info, token, fileId }) => {
    let downloadUrl = fileService.getShareDownloadUrl(token);
    if (fileId) {
        downloadUrl += `?file_id=${encodeURIComponent(fileId)}`;
    }
    const mime = info.mime_type;
    const [textContent, setTextContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const isTextLike = (m?: string, f?: string, s?: number) => {
        if (!m) return false;
        if ((s || 0) > 10 * 1024 * 1024) return false; // 10MB limit
        if (m.startsWith("text/") || m === "application/json" || m === "application/javascript") return true;
        if (f) {
            const ext = f.split(".").pop()?.toLowerCase() || "";
            return ["txt", "md", "json", "js", "ts", "css", "html", "rs", "py", "log", "env", "conf"].includes(ext);
        }
        return false;
    };

    useEffect(() => {
        if (isTextLike(mime, info.filename, info.size)) {
            setLoading(true);
            fetch(downloadUrl)
                .then(res => res.text())
                .then(text => {
                    setTextContent(text);
                    setLoading(false);
                })
                .catch(err => {
                    console.error("Failed to fetch text content", err);
                    setLoading(false);
                });
        } else {
            setTextContent(null);
        }
    }, [mime, downloadUrl, info.filename]);

    if (!mime) return null;

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        return false;
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Loading Content...</span>
            </div>
        );
    }

    return (
        <div className="rfm-share-media-container" onContextMenu={handleContextMenu}>
            {mime.startsWith("image/") && (
                <img
                    src={downloadUrl}
                    alt={info.filename}
                    className="rfm-share-media-preview"
                    onContextMenu={handleContextMenu}
                    draggable={false}
                />
            )}
            {mime.startsWith("video/") && (
                <div className="rfm-share-media-preview bg-black flex items-center justify-center w-full relative aspect-video rounded-xl overflow-hidden" onContextMenu={handleContextMenu}>
                    <ReactPlayer
                        src={downloadUrl}
                        controls
                        playing
                        muted
                        playsInline
                        width="100%"
                        height="100%"
                        className="rfm-share-media-video"
                        style={{ position: 'absolute', top: 0, left: 0 }}
                        onContextMenu={handleContextMenu}
                        /* @ts-ignore */
                        controlsList="nodownload"
                    />
                </div>
            )}
            {mime.startsWith("audio/") && (
                <div className="p-8">
                    <audio
                        controls
                        className="w-full"
                        onContextMenu={handleContextMenu}
                        controlsList="nodownload"
                    >
                        <source src={downloadUrl} type={mime} />
                        Your browser does not support the audio element.
                    </audio>
                </div>
            )}
            {mime === "application/pdf" && (
                <iframe
                    src={`${downloadUrl}#toolbar=0`}
                    className="rfm-share-pdf-viewer"
                    title="PDF Preview"
                    onContextMenu={handleContextMenu}
                />
            )}
            {isTextLike(mime, info.filename, info.size) && textContent !== null && (
                <div className="p-6 max-h-[500px] overflow-auto">
                    <pre className="text-xs font-mono text-stone-700 dark:text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                        {textContent}
                    </pre>
                </div>
            )}
        </div>
    );
};

export const PublicSharePage: React.FC = () => {
    const [token] = useState(window.location.pathname.split("/s/")[1] || "");
    const [shareInfo, setShareInfo] = useState<any>(null);
    const [folderContents, setFolderContents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [password, setPassword] = useState("");
    const [viewingItem, setViewingItem] = useState<any | null>(null);

    const passwordInputRef = useRef<HTMLInputElement>(null);

    const isMediaSupported = (mimeType?: string, filename?: string, size?: number) => {
        if (!mimeType) return false;

        const isText = mimeType.startsWith("text/") ||
            mimeType === "application/json" ||
            mimeType === "application/javascript" ||
            (filename && ["txt", "md", "json", "js", "ts", "css", "html", "rs", "py", "log", "env", "conf"].includes(filename.split(".").pop()?.toLowerCase() || ""));

        if (isText && (size || 0) > 10 * 1024 * 1024) return false;

        const isOtherMedia = mimeType.startsWith("image/") ||
            mimeType.startsWith("video/") ||
            mimeType.startsWith("audio/") ||
            mimeType === "application/pdf";

        return isText || isOtherMedia;
    };

    const fetchShareInfo = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fileService.getPublicShare(token);
            if (data.error) {
                setError(data.error);
            } else {
                setShareInfo(data);
                if (!data.requires_password) {
                    setIsAuthorized(true);
                }
            }
        } catch (err: any) {
            setError(err.message || "Failed to load share information");
        } finally {
            setLoading(false);
        }
    }, [token]);

    const fetchFolderContents = useCallback(async () => {
        try {
            const data = await fileService.listSharedFolder(token);
            if (Array.isArray(data)) {
                setFolderContents(data);
            }
        } catch (err) {
            console.error("Failed to list folder contents", err);
        }
    }, [token]);

    useEffect(() => {
        if (token) {
            fetchShareInfo();
        } else {
            setError("Invalid share link");
            setLoading(false);
        }
    }, [token, fetchShareInfo]);

    useEffect(() => {
        if (isAuthorized && shareInfo?.is_folder) {
            fetchFolderContents();
        }
    }, [isAuthorized, shareInfo, fetchFolderContents]);

    const handleVerifyPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        const pwd = passwordInputRef.current?.value || "";
        if (!pwd) return;

        try {
            setVerifying(true);
            setError(null);
            const result = await fileService.verifySharePassword(token, pwd);
            if (result.verified) {
                setPassword(pwd);
                setIsAuthorized(true);
            } else {
                setError("Incorrect password");
            }
        } catch (err: any) {
            setError("Failed to verify password");
        } finally {
            setVerifying(false);
        }
    };

    const handleDownload = (fileId?: string, filename?: string) => {
        let downloadUrl = fileService.getShareDownloadUrl(token);
        if (fileId) {
            downloadUrl += `?file_id=${encodeURIComponent(fileId)}`;
        }
        window.location.href = downloadUrl;
    };

    if (loading) {
        return (
            <div className="rfm-public-share-container">
                <div className="rfm-share-loading">
                    <div className="rfm-share-loading-spinner" />
                    Initializing Secure Link
                </div>
            </div>
        );
    }

    if (error && !shareInfo) {
        return (
            <div className="rfm-public-share-container">
                <div className="rfm-share-card animate-share-in">
                    <div className="rfm-share-header">
                        <div className="rfm-share-icon-wrapper">
                            <AlertTriangle className="rfm-share-icon text-rose-500" />
                        </div>
                        <h1 className="rfm-share-title">Link Unavailable</h1>
                        <p className="rfm-share-error mt-4">{error}</p>
                    </div>
                    <button
                        className="rfm-share-button rfm-share-button-primary"
                        onClick={() => window.location.href = "/"}
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="rfm-public-share-container">
            <div className="rfm-share-card animate-share-in" style={{
                maxWidth: (shareInfo?.is_folder || isMediaSupported(shareInfo?.mime_type, shareInfo?.filename, shareInfo?.size)) && isAuthorized ? '800px' : '400px'
            }}>
                <div className="rfm-share-header">
                    <div className="rfm-share-icon-wrapper">
                        {shareInfo?.requires_password && !isAuthorized ? (
                            <Lock className="rfm-share-icon text-amber-500" />
                        ) : shareInfo?.is_folder ? (
                            <Folder className="rfm-share-icon text-sky-500" />
                        ) : shareInfo?.permission === "view" ? (
                            <Eye className="rfm-share-icon text-teal-500" />
                        ) : (
                            <File className="rfm-share-icon text-teal-500" />
                        )}
                    </div>
                    <h1 className="rfm-share-title">{shareInfo?.filename || "Shared Item"}</h1>
                    <div className="rfm-share-meta">
                        {shareInfo?.is_folder ? (
                            <span>Folder</span>
                        ) : (
                            <>
                                <span>{formatSize(shareInfo?.size || 0)}</span>
                                <div className="rfm-share-meta-dot" />
                                <span>{shareInfo?.mime_type?.split('/')[1] || "File"}</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="rfm-share-content">
                    {shareInfo?.requires_password && !isAuthorized ? (
                        <div className="rfm-share-password-box">
                            <div className="rfm-share-input-group">
                                <label className="rfm-share-input-label">Password Protected</label>
                                <input
                                    type="text"
                                    className="rfm-share-input"
                                    placeholder="Enter access password"
                                    ref={passwordInputRef}
                                    style={{ WebkitTextSecurity: 'disc' } as any}
                                    onKeyDown={(e) => e.key === "Enter" && handleVerifyPassword(e as any)}
                                    autoFocus
                                />
                            </div>
                            {error && <div className="rfm-share-error">{error}</div>}
                            <button
                                type="button"
                                className="rfm-share-button rfm-share-button-primary"
                                onClick={handleVerifyPassword as any}
                                disabled={verifying}
                            >
                                {verifying ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Verifying
                                    </>
                                ) : (
                                    "Unlock Access"
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {viewingItem ? (
                                <div className="animate-share-in">
                                    <div className="flex items-center gap-3 mb-4">
                                        <button
                                            onClick={() => setViewingItem(null)}
                                            className="p-2 rounded-xl bg-stone-100 dark:bg-slate-800 text-stone-500 hover:text-teal-600 transition-all active:scale-90"
                                            title="Back to folder"
                                        >
                                            <ArrowLeft size={18} />
                                        </button>
                                        <div className="flex flex-col min-w-0">
                                            <h2 className="text-sm font-black text-stone-700 dark:text-slate-200 truncate leading-none mb-1">
                                                {viewingItem.filename}
                                            </h2>
                                            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest leading-none">
                                                Previewing File
                                            </span>
                                        </div>
                                    </div>

                                    <MediaViewer info={viewingItem} token={token} fileId={viewingItem.id} />

                                    <div className="flex flex-col items-center gap-4 mt-6">
                                        <p className="text-sm text-stone-500 dark:text-slate-400 text-center leading-relaxed">
                                            {shareInfo.permission === "download"
                                                ? "You can view this file above or download it directly."
                                                : "This file is available for viewing."}
                                        </p>

                                        {shareInfo.permission === "download" && (
                                            <button
                                                className="rfm-share-button rfm-share-button-download"
                                                onClick={() => handleDownload(viewingItem.id, viewingItem.filename)}
                                            >
                                                <Download className="w-4 h-4" />
                                                Download Previewed File
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : shareInfo?.is_folder ? (
                                <div className="rfm-share-folder-list">
                                    {folderContents.length === 0 ? (
                                        <div className="text-center py-8 text-stone-400 text-xs font-bold uppercase tracking-widest">
                                            Folder is empty
                                        </div>
                                    ) : (
                                        folderContents.map(item => (
                                            <div
                                                key={item.id}
                                                className={`rfm-share-file-item ${!item.is_folder && isMediaSupported(item.mime_type, item.filename, item.size) ? 'is-previewable' : ''}`}
                                                onClick={() => !item.is_folder && isMediaSupported(item.mime_type, item.filename, item.size) && setViewingItem(item)}
                                            >
                                                <div className="rfm-share-file-info">
                                                    <div className="rfm-share-file-icon">
                                                        {item.is_folder ? (
                                                            <Folder className="w-5 h-5 text-sky-500" fill="currentColor" fillOpacity={0.1} />
                                                        ) : (
                                                            <File className="w-5 h-5 text-stone-400" />
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="rfm-share-file-name">{item.filename}</span>
                                                        <span className="rfm-share-file-size">
                                                            {item.is_folder ? 'Folder' : formatSize(item.size || 0)}
                                                        </span>
                                                    </div>
                                                </div>
                                                {!item.is_folder && shareInfo.permission === "download" && (
                                                    <button
                                                        className="rfm-share-download-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDownload(item.id, item.filename);
                                                        }}
                                                    >
                                                        <Download size={16} />
                                                    </button>
                                                )}
                                                {item.is_folder && (
                                                    <ChevronRight size={16} className="text-stone-300" />
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <>
                                    {isMediaSupported(shareInfo?.mime_type, shareInfo?.filename, shareInfo?.size) ? (
                                        <MediaViewer info={shareInfo} token={token} />
                                    ) : (
                                        <div className="p-8 bg-stone-50 dark:bg-slate-800/20 rounded-[2rem] border border-stone-100 dark:border-slate-800/50 flex flex-col items-center gap-4">
                                            <File className="w-12 h-12 text-stone-300" />
                                            <span className="text-xs font-black uppercase tracking-widest text-stone-400">
                                                No Preview Available
                                            </span>
                                        </div>
                                    )}

                                    <p className="text-sm text-stone-500 dark:text-slate-400 text-center leading-relaxed mt-4">
                                        {shareInfo.permission === "download"
                                            ? "This file has been shared with you. You can download it directly below."
                                            : "This file has been shared with you for viewing."}
                                    </p>

                                    {shareInfo.permission === "download" && (
                                        <button
                                            className="rfm-share-button rfm-share-button-download"
                                            onClick={() => handleDownload()}
                                        >
                                            <Download className="w-4 h-4" />
                                            Download File
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="rfm-share-footer">
                    <div className="rfm-share-logo">Juragan Cloud</div>
                </div>
            </div>
        </div>
    );
};
