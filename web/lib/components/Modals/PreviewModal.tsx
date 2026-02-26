import React, { useEffect, useState } from "react";
import CommonModal from "./CommonModal";
import { fileService } from "../../../src/services/fileService";
import SvgIcon from "../Icons/SvgIcon";
import ReactPlayer from "react-player";

interface IPreviewModalProps {
  isVisible: boolean;
  onClose: () => void;
  fileName: string;
  fileUrl?: string;
  fileId?: string;
  mimeType?: string;
  size?: number;
  scanStatus?:
  | "pending"
  | "scanning"
  | "clean"
  | "infected"
  | "unchecked"
  | "not_supported";
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
  const [showDownloadButton, setShowDownloadButton] = useState(true);
  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  const isTextFile =
    (mimeType?.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType === "application/javascript" ||
      ["txt", "md", "json", "js", "css", "html", "rs", "py", "log", "env", "conf"].includes(
        extension
      )) &&
    (size || 0) < 10 * 1024 * 1024; // Increased to 10MB for text files
  const isArchiveFile =
    (mimeType === "application/zip" ||
      ["zip", "7z", "tar", "gz", "rar"].includes(extension)) &&
    (size || 0) < 500 * 1024 * 1024;

  useEffect(() => {
    if (!isVisible) {
      setTextContent(null);
      setArchiveEntries(null);
      setSecureUrl(null);
      setShowDownloadButton(false);
      return;
    }

    setShowDownloadButton(true);
    const timer = setTimeout(() => {
      setShowDownloadButton(false);
    }, 8000);

    const loadContent = async () => {
      setLoading(true);
      let urlToUse = fileUrl;

      // Generate secure presigned URL if fileId is present
      if (fileId) {
        try {
          const res = await fileService.getDownloadTicket(fileId);
          urlToUse = res.url; // presigned URL from backend
          setSecureUrl(urlToUse || null);
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
          .then((res) => res.text())
          .then((text) => {
            setTextContent(text);
            setLoading(false);
          })
          .catch((err) => {
            console.error("Failed to fetch text content:", err);
            setLoading(false);
          });
      } else if (isArchiveFile && fileId) {
        fileService
          .getZipContents(fileId)
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

    return () => clearTimeout(timer);
  }, [isVisible, fileUrl, fileId, isTextFile, isArchiveFile]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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
              <div
                key={idx}
                className={`rfm-zip-entry ${entry.is_dir ? "is-dir" : ""}`}
              >
                <span className="rfm-zip-entry-name">
                  {entry.is_dir ? "📁" : "📄"} {entry.name}
                </span>
                <span className="rfm-zip-entry-size">
                  {entry.is_dir ? "--" : formatSize(entry.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      return false;
    };

    if (
      ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension) &&
      secureUrl
    ) {
      return (
        <div className="rfm-preview-content" onContextMenu={handleContextMenu}>
          <img
            src={secureUrl}
            alt={fileName}
            className="rfm-preview-image"
            onContextMenu={handleContextMenu}
            draggable={false}
          />
        </div>
      );
    }

    const videoExtensions = ["mp4", "webm", "ogg", "ts", "mkv", "avi", "mov", "flv", "wmv", "m4v"];
    if (videoExtensions.includes(extension) && secureUrl) {
      return (
        <div className="rfm-preview-content bg-black w-full h-full flex items-center justify-center relative" onContextMenu={handleContextMenu}>
          <ReactPlayer
            src={secureUrl}
            controls
            width="100%"
            height="100%"
            style={{ position: 'absolute', top: 0, left: 0 }}
            className="rfm-preview-video"
            onContextMenu={handleContextMenu}
            /* @ts-ignore */
            controlsList="nodownload"
          />
        </div>
      );
    }

    if (["mp3", "wav", "ogg"].includes(extension) && secureUrl) {
      return (
        <div className="rfm-preview-content" onContextMenu={handleContextMenu}>
          <audio
            controls
            className="rfm-preview-audio"
            onContextMenu={handleContextMenu}
            controlsList="nodownload"
          >
            <source src={secureUrl} />
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }

    if (extension === "pdf" && secureUrl) {
      return (
        <div className="rfm-preview-content rfm-preview-full" onContextMenu={handleContextMenu}>
          <embed
            src={secureUrl}
            type="application/pdf"
            className="rfm-preview-pdf"
            // @ts-ignore
            onContextMenu={handleContextMenu}
          />
        </div>
      );
    }

    return (
      <div className="rfm-preview-no-support">
        <span className="text-sm font-medium mb-6 opacity-60 italic">
          Preview not available for this file type.
        </span>

        <div className="rfm-preview-metadata-box">
          <div className="rfm-metadata-row">
            <span>File Name</span>
            <span title={fileName}>{fileName}</span>
          </div>
          <div className="rfm-metadata-row">
            <span>File Type</span>
            <span className="uppercase">{extension || "Unknown"}</span>
          </div>
          <div className="rfm-metadata-row">
            <span>File Size</span>
            <span>{size ? formatSize(size) : "Unknown"}</span>
          </div>
          {mimeType && (
            <div className="rfm-metadata-row">
              <span>MIME Type</span>
              <span>{mimeType}</span>
            </div>
          )}
          <div className="rfm-metadata-row">
            <span>Scan Status</span>
            <div className={`rfm-status-badge is-${scanStatus || "unchecked"}`}>
              <SvgIcon svgType="shield" className="w-3.5 h-3.5 mr-1" />
              {scanStatus || "unchecked"}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <CommonModal
      isVisible={isVisible}
      onClose={onClose}
      title={`Preview: ${fileName}`}
      className="rfm-preview-modal"
      clickPosition={clickPosition}
    >
      {renderPreview()}
      {secureUrl && !loading && (
        <a
          href={secureUrl}
          download={fileName}
          className="rfm-preview-float-download"
          title="Download File"
          style={{
            opacity: showDownloadButton ? 1 : 0,
            pointerEvents: showDownloadButton ? "auto" : "none",
            transform: `translateX(-50%) ${showDownloadButton ? "scale(1)" : "scale(0.9) translateY(20px)"
              }`,
          }}
        >
          {size && (
            <span className="rfm-float-size-info">{formatSize(size)}</span>
          )}
          <div className="rfm-float-download-btn-content">
            <SvgIcon svgType="download" />
            <span>Download</span>
          </div>
        </a>
      )}
    </CommonModal>
  );
};

export default PreviewModal;
