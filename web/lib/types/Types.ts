export type UploadStatus = {
  id: string;
  name: string;
  progress: number;
  status:
    | "queued"
    | "hashing"
    | "uploading"
    | "processing"
    | "completed"
    | "error";
  error?: string;
  size?: number;
  uploadId?: string;
};

export interface UserFacts {
  total_files: number;
  total_size: number;
  video_count: number;
  audio_count: number;
  document_count: number;
  image_count: number;
  others_count: number;
  storage_limit?: number;
  updated_at: string;
}

export interface BackendFile {
  id: string;
  filename?: string;
  name?: string;
  is_folder?: boolean;
  isDir?: boolean;
  parent_id?: string;
  parentId?: string;
  size?: string | number;
  updated_at?: string;
  created_at?: string;
  mime_type?: string;
  mimeType?: string;
  scan_status?: FileType["scanStatus"];
  scanStatus?: FileType["scanStatus"];
  hash?: string;
  is_favorite?: boolean;
  isFavorite?: boolean;
  extra_metadata?: any;
  extraMetadata?: any;
  has_thumbnail?: boolean;
  hasThumbnail?: boolean;
  is_encrypted?: boolean;
  isEncrypted?: boolean;
  is_shared?: boolean;
  isShared?: boolean;
}

// Be careful: even a folder is a file!
export type FileType = {
  id: string; // Unique ID given to this file
  name: string;
  isDir: boolean;
  path?: string; // Optional because files inherit the path from the parentId folder
  parentId?: string; // Optional because the root folder does not have a parent
  lastModified?: number;
  scanStatus?:
    | "pending"
    | "scanning"
    | "clean"
    | "infected"
    | "unchecked"
    | "not_supported";
  size?: number;
  mimeType?: string;
  hash?: string;
  extraMetadata?: any;
  expiresAt?: string;
  isFavorite?: boolean;
  hasThumbnail?: boolean;
  isEncrypted?: boolean;
  isShared?: boolean;
};

export type FileSystemType = FileType[];

export type ValidationRules = {
  allowed_mimes: string[];
  blocked_extensions: string[];
  max_file_size: number;
  chunk_size: number;
};

export type FolderNode = {
  id: string;
  filename: string;
  parent_id: string | null;
};

export interface ShareLink {
  id: string;
  user_file_id: string;
  share_token: string;
  share_type: "public" | "user";
  shared_with_user_id?: string;
  has_password: boolean;
  permission: "view" | "download";
  expires_at: string;
  created_at: string;
  filename?: string;
  is_folder?: boolean;
  parent_id?: string;
}

export interface ShareAccessLog {
  id: string;
  accessed_by_user_id?: string;
  ip_address?: string;
  user_agent?: string;
  action: string;
  accessed_at: string;
}
