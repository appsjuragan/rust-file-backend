import type { FileType, BackendFile } from "../types";

/**
 * Maps a raw API file response to the internal FileType interface.
 * Handles default values for missing fields to ensure type safety.
 */
export const mapApiFileToFileType = (item: BackendFile): FileType => {
  const lastModified = item.updated_at
    ? new Date(item.updated_at).getTime() / 1000
    : item.created_at
      ? new Date(item.created_at).getTime() / 1000
      : Date.now() / 1000;

  return {
    id: item.id,
    name:
      (item.is_system || item.isSystem) &&
        (item.filename === ".Trash" || item.name === ".Trash")
        ? "Trash"
        : item.filename || item.name || "Unknown",
    isDir: item.is_folder ?? item.isDir ?? false,
    parentId: item.parent_id || item.parentId || "0",
    size: item.size ? Number(item.size) : 0,
    lastModified,
    mimeType: item.mime_type || item.mimeType,
    scanStatus: item.scan_status || item.scanStatus,
    hash: item.hash,
    isFavorite: item.is_favorite ?? item.isFavorite ?? false,
    hasThumbnail: item.has_thumbnail ?? item.hasThumbnail ?? false,
    isEncrypted: item.is_encrypted ?? item.isEncrypted ?? false,
    isShared: item.is_shared ?? item.isShared ?? false,
    shareToken: item.share_token || item.shareToken,
    extraMetadata: item.extra_metadata || item.extraMetadata,
    isSystem: item.is_system ?? item.isSystem ?? false,
    hasPassword: item.has_password,
    isLocked: item.is_locked ?? item.isLocked ?? false,
    expiresAt: item.expires_at || item.expiresAt,
  };
};
