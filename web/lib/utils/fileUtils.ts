import type { FileType } from "../types";

/**
 * Checks if a target folder is a descendant of (or the same as) a source folder.
 * This is used to prevent circular moves in the file system.
 */
/**
 * Checks if a target folder is a descendant of (or the same as) a source folder.
 * Optimized to use an optional pre-computed map or lookup function for O(1) lookups.
 */
export const isDescendantOrSelf = (
  fs:
    | FileType[]
    | Map<string, FileType>
    | ((id: string) => string | undefined | null),
  sourceId: string,
  targetId: string,
): boolean => {
  if (sourceId === targetId) return true;

  // Fast path: use map/function if provided
  const getParentId = (id: string): string | undefined => {
    if (typeof fs === "function") {
      const pid = fs(id);
      return pid ?? undefined;
    }
    if (fs instanceof Map) {
      return fs.get(id)?.parentId;
    }
    return fs.find((f) => f.id === id)?.parentId;
  };

  let currentId: string | undefined = targetId;
  const visited = new Set<string>();

  while (currentId && currentId !== "0" && !visited.has(currentId)) {
    visited.add(currentId);
    const parentId = getParentId(currentId);

    if (!parentId) break;
    if (parentId === sourceId) return true;

    currentId = parentId;
  }

  return false;
};

export const formatShareExpiry = (dateStr: string): string => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs <= 0) return "Expired";
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 24) return `${diffH}h left`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d left`;
};

export const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))}\u00a0${sizes[i]}`;
};
export const formatMimeType = (mime?: string) => {
  if (!mime) return "Unknown";

  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";

  switch (mime) {
    case "application/pdf":
      return "PDF";
    case "text/plain":
      return "Text";
    case "application/zip":
    case "application/x-zip-compressed":
      return "Zip Archive";

    // Microsoft Office
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "Word Document";
    case "application/vnd.ms-excel":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "Excel Spreadsheet";
    case "application/vnd.ms-powerpoint":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "PowerPoint Presentation";

    default:
      // Try to clean up others if they are too long
      if (mime.length > 30) {
        const parts = mime.split("/");
        if (parts.length > 1 && parts[1]) {
          const subParts = parts[1].split(/[.-]/);
          if (subParts.length > 0 && subParts[0])
            return subParts[0].toUpperCase();
        }
      }
      return mime;
  }
};
