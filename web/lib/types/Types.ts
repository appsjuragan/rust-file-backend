export type UploadStatus = {
  id: string;
  name: string;
  progress: number;
  status: 'queued' | 'hashing' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  size?: number;
};

// Be careful: even a folder is a file!
export type FileType = {
  id: string; // Unique ID given to this file
  name: string;
  isDir: boolean;
  path?: string; // Optional because files inherit the path from the parentId folder
  parentId?: string; // Optional because the root folder does not have a parent
  lastModified?: number;
  scanStatus?: "pending" | "scanning" | "clean" | "infected" | "unchecked";
  size?: number;
  mimeType?: string;
  hash?: string;
  extraMetadata?: any;
};

export type FileSystemType = FileType[];

