import React, { useEffect, useState } from "react";
import CommonModal from "./CommonModal";
import { api } from "../../src/api";

interface IPreviewModalProps {
    isVisible: boolean;
    onClose: () => void;
    fileName: string;
    fileUrl: string;
    mimeType?: string;
    size?: number;
}

const PreviewModal: React.FC<IPreviewModalProps> = ({
    isVisible,
    onClose,
    fileName,
    fileUrl,
    mimeType,
    size,
}) => {
    const [textContent, setTextContent] = useState<string | null>(null);
    const [archiveEntries, setArchiveEntries] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);
    const extension = fileName.split(".").pop()?.toLowerCase() || "";

    const isTextFile = (mimeType === "text/plain" || ["txt", "md", "json", "js", "ts", "css", "html", "rs", "py"].includes(extension)) && (size || 0) < 100 * 1024;
    const isArchiveFile = (mimeType === "application/zip" || ["zip", "7z", "tar", "gz", "rar"].includes(extension)) && (size || 0) < 500 * 1024 * 1024;

    useEffect(() => {
        if (isVisible) {
            if (isTextFile) {
                setLoading(true);
                fetch(fileUrl)
                    .then(res => res.text())
                    .then(text => {
                        setTextContent(text);
                        setLoading(false);
                    })
                    .catch(err => {
                        console.error("Failed to fetch text content:", err);
                        setLoading(false);
                    });
            } else if (isArchiveFile && fileUrl) {
                setLoading(true);
                const parts = fileUrl.split('/files/');
                if (parts.length > 1) {
                    const fileId = parts[1]?.split('?')[0] || "";
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
            }
        } else {
            setTextContent(null);
            setArchiveEntries(null);
        }
    }, [isVisible, fileUrl, isTextFile, isArchiveFile]);

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
                <div className="rfm-preview-content">
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

        if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension)) {
            return (
                <div className="rfm-preview-content">
                    <img src={fileUrl} alt={fileName} className="rfm-preview-image" />
                </div>
            );
        }

        if (["mp4", "webm", "ogg"].includes(extension)) {
            return (
                <div className="rfm-preview-content">
                    <video controls className="rfm-preview-video">
                        <source src={fileUrl} />
                        Your browser does not support the video tag.
                    </video>
                </div>
            );
        }

        if (["mp3", "wav", "ogg"].includes(extension)) {
            return (
                <div className="rfm-preview-content">
                    <audio controls className="rfm-preview-audio">
                        <source src={fileUrl} />
                        Your browser does not support the audio element.
                    </audio>
                </div>
            );
        }

        if (extension === "pdf") {
            return (
                <div className="rfm-preview-content">
                    <iframe src={fileUrl} className="rfm-preview-pdf" title={fileName} />
                </div>
            );
        }

        return (
            <div className="rfm-preview-no-support">
                Preview not available for this file type.
                <br />
                <a href={fileUrl} download={fileName} className="rfm-btn-primary mt-4 inline-block">
                    Download File
                </a>
            </div>
        );
    };

    return (
        <CommonModal isVisible={isVisible} onClose={onClose} title={`Preview: ${fileName}`}>
            {renderPreview()}
        </CommonModal>
    );
};

export default PreviewModal;
