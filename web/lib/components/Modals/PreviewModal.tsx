import React, { useEffect, useState, useMemo } from "react";
import CommonModal from "./CommonModal";
import { useFileManager } from "../../context";
import { fileService } from "../../../src/services/fileService";
import SvgIcon from "../Icons/SvgIcon";
import ReactPlayer from "react-player";
import MpegTsPlayer from "../MpegTsPlayer/MpegTsPlayer";
import type { FileType } from "../../types/Types";

const PdfViewer = React.lazy(() => import("../PdfViewer/PdfViewer"));
const HeicViewer = React.lazy(() => import("./HeicViewer"));
const DocViewerWrapper = React.lazy(() => import("./DocViewerWrapper"));
const LocalOfficeViewer = React.lazy(() => import("./LocalOfficeViewer"));

interface IPreviewFileItemProps {
  file: FileType;
  isActive: boolean;
  isVisible: boolean;
}

const PreviewFileItem: React.FC<IPreviewFileItemProps> = ({
  file,
  isActive,
  isVisible,
}) => {
  const { autoplay } = useFileManager();
  const [textContent, setTextContent] = useState<string | null>(null);
  const [archiveEntries, setArchiveEntries] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [secureUrl, setSecureUrl] = useState<string | null>(null);

  const fileName = file.name;
  const fileId = file.id;
  const fileUrl = (file as any).url; // Adjust if your FileType has a URL
  const mimeType = file.mimeType;
  const size = file.size;
  const scanStatus = file.scanStatus;

  const extension = fileName.split(".").pop()?.toLowerCase() || "";

  const isTextFile =
    (mimeType?.startsWith("text/") ||
      mimeType === "application/json" ||
      mimeType === "application/javascript" ||
      [
        "txt",
        "md",
        "json",
        "js",
        "css",
        "html",
        "htm",
        "rs",
        "py",
        "log",
        "env",
        "conf",
      ].includes(extension)) &&
    (size || 0) < 10 * 1024 * 1024;

  const isArchiveFile =
    (mimeType === "application/zip" ||
      ["zip", "7z", "tar", "gz", "rar"].includes(extension)) &&
    (size || 0) < 500 * 1024 * 1024;

  const isLocalOfficeFile =
    ["docx", "xlsx", "xls"].includes(extension) ||
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-office",
    ].includes(mimeType || "");

  const isDocViewerFile =
    !isLocalOfficeFile && (
      ["tiff"].includes(extension) ||
      ["image/tiff"].includes(mimeType || "")
    );

  useEffect(() => {
    if (!isVisible) return;

    const loadContent = async () => {
      setLoading(true);
      let urlToUse = fileUrl;

      if (fileId) {
        try {
          const res = await fileService.getDownloadTicket(fileId);
          urlToUse = res.url;
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

      // Only fetch content for text/archive if this item is ACTIVE
      if (isActive) {
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
      } else {
        setLoading(false);
      }
    };

    loadContent();
  }, [fileId, fileUrl, isActive, isVisible, isTextFile, isArchiveFile]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  };

  const renderPreview = () => {
    if (loading && isActive) {
      return (
        <div className="rfm-preview-loading flex flex-col items-center gap-3">
          <div className="rfm-spinner"></div>
          <span>Loading content...</span>
        </div>
      );
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

    if (
      ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(extension) &&
      secureUrl
    ) {
      return (
        <div className="rfm-preview-content" onContextMenu={handleContextMenu}>
          <img
            src={secureUrl as string}
            alt={fileName}
            className="rfm-preview-image"
            onContextMenu={handleContextMenu}
            draggable={false}
          />
        </div>
      );
    }

    if (
      ["heic", "heif"].includes(extension) &&
      secureUrl
    ) {
      return (
        <div className="rfm-preview-content" onContextMenu={handleContextMenu}>
          <HeicViewer
            url={secureUrl as string}
            className="rfm-preview-image"
            onContextMenu={handleContextMenu}
          />
        </div>
      );
    }

    const mpegTsExtensions = ["ts", "m2ts"];
    const videoExtensions = [
      "mp4",
      "webm",
      "ogg",
      "mkv",
      "avi",
      "mov",
      "flv",
      "wmv",
      "m4v",
    ];

    if (mpegTsExtensions.includes(extension) && secureUrl) {
      return (
        <div
          className="rfm-preview-content bg-black w-full h-full flex items-center justify-center relative"
          onContextMenu={handleContextMenu}
        >
          <MpegTsPlayer
            url={secureUrl}
            controls
            width="100%"
            height="100%"
            style={{ position: "absolute", top: 0, left: 0 }}
            className="rfm-preview-video"
            onContextMenu={handleContextMenu}
          />
        </div>
      );
    }

    const VideoViewer = ({ url, active }: { url: string; active: boolean }) => {
      const videoRef = React.useRef<HTMLVideoElement>(null);

      React.useEffect(() => {
        if (active && autoplay && videoRef.current) {
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch((error) => {
              if (error.name !== "AbortError") {
                console.warn("Playback prevented:", error);
              }
            });
          }
        } else if (!active && videoRef.current) {
          videoRef.current.pause();
          videoRef.current.load(); // Prepare for later
        }
      }, [active]);

      return (
        <video
          ref={videoRef}
          src={url}
          className="rfm-preview-video"
          controls={active}
          muted
          playsInline
          loop
          onContextMenu={handleContextMenu}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      );
    };

    if (videoExtensions.includes(extension) && secureUrl) {
      return (
        <div
          className="rfm-preview-content bg-black w-full h-full flex items-center justify-center relative"
          onContextMenu={handleContextMenu}
        >
          <VideoViewer url={secureUrl} active={isActive} />
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
        <div
          className="rfm-preview-content rfm-preview-full"
          onContextMenu={handleContextMenu}
        >
          <PdfViewer url={secureUrl} disableContextMenu />
        </div>
      );
    }

    if (isDocViewerFile && secureUrl) {
      return (
        <div
          className="rfm-preview-content rfm-preview-full doc-viewer-wrapper"
          onContextMenu={handleContextMenu}
        >
          <DocViewerWrapper
            url={secureUrl}
            fileName={fileName}
            mimeType={mimeType}
          />
        </div>
      );
    }

    if (isLocalOfficeFile && secureUrl) {
      return (
        <div
          className="rfm-preview-content rfm-preview-full"
          onContextMenu={handleContextMenu}
        >
          <LocalOfficeViewer
            url={secureUrl}
            fileName={fileName}
            extension={extension}
          />
        </div>
      );
    }

    // Heavy content (Text/Archive) only rendered if ACTIVE
    if (!isActive) return null;

    // Default metadata view for unsupported types when active
    return (
      <div className="rfm-preview-content rfm-preview-no-support flex flex-col items-center justify-center p-10">
        <div className="flex flex-col items-center gap-4 text-stone-400">
          <SvgIcon svgType="file" className="w-20 h-20 opacity-20" />
          <p className="text-sm font-medium">Preview not available for this file type</p>
          <div className="text-[10px] opacity-60 uppercase tracking-widest bg-stone-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-stone-200 dark:border-slate-700">
            {extension || "Unknown"} File
          </div>
          <div className="rfm-metadata-row mt-4">
            <p className="text-sm font-medium">Scan Status</p>
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
    <div
      className={`rfm-preview-item ${isActive ? "is-active" : "is-preload"}`}
    >
      <React.Suspense fallback={<div className="rfm-preview-loading">Loading viewer...</div>}>
        {renderPreview()}
      </React.Suspense>
    </div>
  );
};

interface IPreviewModalProps {
  isVisible: boolean;
  onClose: () => void;
  currentFile: FileType;
  previousFile?: FileType | null;
  nextFile?: FileType | null;
  onNext?: () => void;
  onPrevious?: () => void;
  clickPosition?: { x: number; y: number } | null;
}

const PreviewModal: React.FC<IPreviewModalProps> = ({
  isVisible,
  onClose,
  currentFile,
  previousFile,
  nextFile,
  onNext,
  onPrevious,
  clickPosition,
}) => {
  const { autoplay } = useFileManager();
  const [showDownloadButton, setShowDownloadButton] = useState(true);

  useEffect(() => {
    if (!isVisible) {
      setShowDownloadButton(false);
      return;
    }

    setShowDownloadButton(true);
    const timer = setTimeout(() => {
      setShowDownloadButton(false);
    }, 8000);

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && onNext) {
        onNext();
      } else if (e.key === "ArrowLeft" && onPrevious) {
        onPrevious();
      }
    };

    window.addEventListener("keydown", handleKeydown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [isVisible, onNext, onPrevious]);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0]?.clientX || null);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0]?.clientX;
    if (touchEnd === undefined) return;
    const distance = touchStart - touchEnd;
    const threshold = 50;

    if (distance > threshold && onNext) {
      onNext();
    } else if (distance < -threshold && onPrevious) {
      onPrevious();
    }
    setTouchStart(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // We only render CURRENT and NEXT to satisfy "lazy load next 1 and pop other -1"
  return (
    <CommonModal
      isVisible={isVisible}
      onClose={onClose}
      title={`Preview: ${currentFile.name}`}
      className="rfm-preview-modal"
      clickPosition={clickPosition}
    >
      <div
        className="rfm-preview-modal-container"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="rfm-preview-window">
          {/* Previous is popped (not rendered) */}

          {/* Current File */}
          <PreviewFileItem
            key={currentFile.id}
            file={currentFile}
            isActive={true}
            isVisible={isVisible}
          />

          {/* Lazy Loaded Next File */}
          {nextFile && (
            <PreviewFileItem
              key={nextFile.id}
              file={nextFile}
              isActive={false}
              isVisible={isVisible}
            />
          )}
        </div>

        {(onPrevious || onNext) && (
          <div className="rfm-preview-nav-overlay">
            {onPrevious && (
              <button
                className="rfm-preview-nav-btn rfm-nav-prev"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrevious();
                }}
                title="Previous"
              >
                <SvgIcon svgType="arrow-right" style={{ transform: "rotate(180deg)" }} />
              </button>
            )}
            {onNext && (
              <button
                className="rfm-preview-nav-btn rfm-nav-next"
                onClick={(e) => {
                  e.stopPropagation();
                  onNext();
                }}
                title="Next"
              >
                <SvgIcon svgType="arrow-right" />
              </button>
            )}
          </div>
        )}
      </div>

      <a
        href="#"
        onClick={async (e) => {
          e.preventDefault();
          const res = await fileService.getDownloadTicket(currentFile.id);
          if (res.url) {
            window.open(res.url, '_blank');
          }
        }}
        className="rfm-preview-float-download"
        title="Download File"
        style={{
          opacity: showDownloadButton ? 1 : 0,
          pointerEvents: showDownloadButton ? "auto" : "none",
          transform: `translateX(-50%) ${showDownloadButton ? "scale(1)" : "scale(0.9) translateY(20px)"}`,
        }}
      >
        {currentFile.size && (
          <span className="rfm-float-size-info">{formatSize(currentFile.size)}</span>
        )}
        <div className="rfm-float-download-btn-content">
          <SvgIcon svgType="download" />
          <span>Download</span>
        </div>
      </a>
    </CommonModal>
  );
};

export default PreviewModal;
