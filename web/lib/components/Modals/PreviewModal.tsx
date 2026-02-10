import React, { useEffect, useState } from "react";
import CommonModal from "./CommonModal";
import { api } from "../../../src/api";

interface IPreviewModalProps {
    isVisible: boolean;
    onClose: () => void;
    fileName: string;
    fileUrl?: string;
    fileId?: string;
    mimeType?: string;
    size?: number;
    scanStatus?: "pending" | "scanning" | "clean" | "infected" | "unchecked";
    clickPosition?: { x: number; y: number } | null;
}

const PreviewModal: React.FC<IPreviewModalProps> = ({
    isVisible,
    onClose,
    fileName,
    fileUrl,
    fileId,
    mimeType,
    size,
    scanStatus,
    clickPosition,
}) => {
    const [textContent, setTextContent] = useState<string | null>(null);
    const [archiveEntries, setArchiveEntries] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [secureUrl, setSecureUrl] = useState<string | null>(null);
    const extension = fileName.split(".").pop()?.toLowerCase() || "";

    const isTextFile = (mimeType === "text/plain" || ["txt", "md", "json", "js", "ts", "css", "html", "rs", "py"].includes(extension)) && (size || 0) < 100 * 1024;
    const isArchiveFile = (mimeType === "application/zip" || ["zip", "7z", "tar", "gz", "rar"].includes(extension)) && (size || 0) < 500 * 1024 * 1024;

    useEffect(() => {
        if (!isVisible) {
            setTextContent(null);
            setArchiveEntries(null);
            setSecureUrl(null);
            return;
        }

        const loadContent = async () => {
            setLoading(true);
            let urlToUse = fileUrl;

            // Generate secure ticket URL if fileId is present
            if (fileId) {
                try {
                    const res = await api.getDownloadTicket(fileId);
                    urlToUse = api.getDownloadUrl(res.ticket);
                    setSecureUrl(urlToUse);
                } catch (e) {
                    console.error("Failed to get preview ticket", e);
                    setLoading(false);
                    return;
                }
            } else if (fileUrl) {
                setSecureUrl(fileUrl);
            }

            if (!urlToUse) {
                setLoading(false);
                return;
            }

            if (isTextFile) {
                fetch(urlToUse)
                    .then(res => res.text())
                    .then(text => {
                        setTextContent(text);
                        setLoading(false);
                    })
                    .catch(err => {
                        console.error("Failed to fetch text content:", err);
                        setLoading(false);
                    });
            } else if (isArchiveFile && fileId) {
                api.getZipContents(fileId)
                    .then((entries: any) => {
                        setArchiveEntries(entries);
                        setLoading(false);
                    })
                    .catch((err: any) => {
                        console.error("Failed to fetch archive contents:", err);
                        setLoading(false);
                    });
            } else {
                setLoading(false);
            }
        };

        loadContent();
    }, [isVisible, fileUrl, fileId, isTextFile, isArchiveFile]);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const renderPreview = () => {
        if (loading) {
            return <div className="rfm-preview-loading">Loading content...</div>;
        }

        if (isTextFile && textContent !== null) {
            return (
                <div className="rfm-preview-content rfm-preview-full">
                    <textarea
                        className="rfm-preview-textarea"
                        value={textContent}
                        readOnly
                        spellCheck={false}
                    />
                </div>
            );
        }

        if (isArchiveFile && archiveEntries !== null) {
            return (
                <div className="rfm-zip-preview">
                    <div className="rfm-zip-header">
                        <span>Name</span>
                        <span>Size</span>
                    </div>
                    <div className="rfm-zip-list">
                        {archiveEntries.map((entry, idx) => (
                            <div key={idx} className={`rfm-zip-entry ${entry.is_dir ? 'is-dir' : ''}`}>
                                <span className="rfm-zip-entry-name">
                                    {entry.is_dir ? '📁' : '📄'} {entry.name}
                                </span>
                                <span className="rfm-zip-entry-size">
                                    {entry.is_dir ? '--' : formatSize(entry.size)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension) && secureUrl) {
            return (
                <div className="rfm-preview-content">
                    <img src={secureUrl} alt={fileName} className="rfm-preview-image" />
                </div>
            );
        }

        if (["mp4", "webm", "ogg", "ts"].includes(extension) && secureUrl) {
            return (
                <div className="rfm-preview-content">
                    <video controls className="rfm-preview-video" crossOrigin="anonymous">
                        <source src={secureUrl} type={mimeType || "video/mp4"} />
                        Your browser does not support the video tag.
                    </video>
                    {(mimeType === "video/mp2t" || extension === "ts") && (
                        <div className="mt-2 text-xs text-amber-600 font-medium bg-amber-50 p-2 rounded border border-amber-100">
                            ⚠️ This file is in MPEG-TS format, which may not play in all browsers. If it doesn't play, please download it to view.
                        </div>
                    )}
                </div>
            );
        }

        if (["mp3", "wav", "ogg"].includes(extension) && secureUrl) {
            return (
                <div className="rfm-preview-content">
                    <audio controls className="rfm-preview-audio">
                        <source src={secureUrl} />
                        Your browser does not support the audio element.
                    </audio>
                </div>
            );
        }

        if (extension === "pdf" && secureUrl) {
            return (
                <div className="rfm-preview-content rfm-preview-full">
                    <iframe src={secureUrl} className="rfm-preview-pdf" title={fileName} />
                </div>
            );
        }

        return (
            <div className="rfm-preview-no-support">
                Preview not available for this file type.
                <br />
                {secureUrl && (
                    <a href={secureUrl} download={fileName} className="rfm-btn-primary mt-4 inline-block">
                        Download File
                    </a>
                )}
            </div>
        );
    };

    return (
        <CommonModal isVisible={isVisible} onClose={onClose} title={`Preview: ${fileName}`} className="rfm-preview-modal" clickPosition={clickPosition}>
            {renderPreview()}
        </CommonModal>
    );
};

export default PreviewModal;
