import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
// Context
import { useFileManager } from "../../context";
// Components
import SvgIcon from "./SvgIcon";
import "./FileIcon.css";
// HTTP Client
import { request } from "../../../src/services/httpClient";

// File types that support thumbnail generation
const THUMBNAIL_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "svg",
  "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "mpg", "mpeg",
  "pdf",
]);

interface IFileIcon {
  id: string;
  name: string;
  isDir: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  hideName?: boolean;
  className?: string;
  isFavorite?: boolean;
  hasThumbnail?: boolean;
  scanStatus?: string;
}

const FileIcon = (props: IFileIcon) => {
  const { setCurrentFolder, onRefresh, clipboardIds, isCut, favorites } =
    useFileManager();
  const isBeingCut = !!(
    isCut &&
    Array.isArray(clipboardIds) &&
    clipboardIds.includes(props.id)
  );

  // Determine favorite status: either from prop or by checking against favorites in context
  const isFavorited =
    props.isFavorite !== undefined
      ? props.isFavorite
      : favorites?.some((f) => f.id === props.id) || false;

  const fileExtension = useMemo((): string => {
    if (props.isDir || !props.name.includes(".")) {
      return "";
    }

    const nameArray = props.name.split(".");
    const ext = (nameArray[nameArray.length - 1] || "").trim().toLowerCase();

    // Valid extensions for icon overlay: 2-4 chars, alphanumeric only
    const isValidExt = /^[a-z0-9]{2,4}$/i.test(ext);

    if (!isValidExt) {
      return "";
    }

    return ext;
  }, [props.name, props.isDir]);

  const colorCategory = useMemo(() => {
    if (props.isDir) return "folder";
    const ext = fileExtension.toLowerCase();

    if (
      ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico"].includes(ext)
    )
      return "image";
    if (
      [
        "mp4",
        "mkv",
        "avi",
        "mov",
        "wmv",
        "flv",
        "webm",
        "mpg",
        "mpeg",
      ].includes(ext)
    )
      return "video";
    if (["pdf"].includes(ext)) return "pdf";
    if (["doc", "docx", "rtf", "odt"].includes(ext)) return "word";
    if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "excel";
    if (["ppt", "pptx", "odp"].includes(ext)) return "powerpoint";
    if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext))
      return "archive";
    if (
      ["txt", "md", "log", "ini", "conf", "json", "yml", "yaml"].includes(ext)
    )
      return "text";
    if (["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(ext))
      return "audio";
    if (
      [
        "js",
        "ts",
        "tsx",
        "jsx",
        "py",
        "rb",
        "php",
        "c",
        "cpp",
        "h",
        "java",
        "go",
        "rs",
        "html",
        "css",
      ].includes(ext)
    )
      return "code";

    return "default";
  }, [fileExtension, props.isDir]);

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);

  // Check if this file type supports thumbnails
  const supportsThumbnail = useMemo(() => {
    if (props.isDir) return false;
    return THUMBNAIL_EXTENSIONS.has(fileExtension.toLowerCase());
  }, [props.isDir, fileExtension]);

  // Fetch thumbnail blob
  const fetchThumbnail = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    try {
      const res = await request(`/files/${props.id}/thumbnail`, { method: "GET", signal });
      if (res && typeof res.blob === "function") {
        const blob = await res.blob();
        if (!signal?.aborted) {
          setThumbnailUrl(URL.createObjectURL(blob));
          return true;
        }
      }
    } catch {
      // Thumbnail not ready yet or request failed
    }
    return false;
  }, [props.id]);

  // Primary effect: load thumbnail immediately if available
  useEffect(() => {
    if (thumbnailUrl) return; // Already loaded
    if (props.isDir) return;

    const controller = new AbortController();

    if (props.hasThumbnail) {
      // Thumbnail is known to exist, fetch it
      fetchThumbnail(controller.signal);
    } else if (supportsThumbnail && !isPolling) {
      // Thumbnail not ready yet, start async polling
      setIsPolling(true);
      pollCountRef.current = 0;
    }

    return () => {
      controller.abort();
    };
  }, [props.hasThumbnail, props.isDir, props.id, supportsThumbnail]);

  // Polling effect: check for thumbnail every few seconds
  useEffect(() => {
    if (!isPolling || thumbnailUrl) {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      return;
    }

    const controller = new AbortController();
    const MAX_POLLS = 12; // Stop after ~60s (12 * 5s)
    const POLL_INTERVAL = 5000;

    const poll = async () => {
      if (pollCountRef.current >= MAX_POLLS) {
        setIsPolling(false);
        return;
      }
      pollCountRef.current += 1;

      const success = await fetchThumbnail(controller.signal);
      if (success) {
        setIsPolling(false);
      } else if (!controller.signal.aborted) {
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);
      }
    };

    pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);

    return () => {
      controller.abort();
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [isPolling, thumbnailUrl, fetchThumbnail]);

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (thumbnailUrl) {
        URL.revokeObjectURL(thumbnailUrl);
      }
    };
  }, [thumbnailUrl]);

  const handleImageLoad = () => {
    setThumbLoaded(true);
  };

  return (
    <div
      className={`rfm-file-icon-container ${props.className || ""} ${isBeingCut ? "opacity-40" : ""
        }`}
      data-color={colorCategory}
    >
      <div className="rfm-file-icon-wrapper relative flex justify-center items-center shrink-0 overflow-hidden rounded">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={props.name}
            className={`rfm-thumbnail-img ${thumbLoaded ? "rfm-thumb-loaded" : "rfm-thumb-loading"}`}
            onLoad={handleImageLoad}
          />
        ) : (
          <>
            {isPolling && supportsThumbnail && (
              <div className="rfm-thumb-shimmer" />
            )}
            <SvgIcon
              svgType={props.isDir ? "folder" : "file"}
              className="rfm-file-icon-svg"
            />
            {!props.isDir && fileExtension && (
              <span className="rfm-file-icon-extension">{fileExtension}</span>
            )}
          </>
        )}
        {isFavorited && (
          <div className="rfm-file-icon-favorite-badge z-10">
            <SvgIcon
              svgType="star"
              className="w-full h-full text-yellow-500 fill-current shadow-sm"
            />
          </div>
        )}
      </div>
      {!props.hideName && (
        <span className="rfm-file-icon-name">{props.name}</span>
      )}
    </div>
  );
};

export default FileIcon;
