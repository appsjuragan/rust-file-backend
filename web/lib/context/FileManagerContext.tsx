import type { Dispatch } from "react";
import { createContext, useContext } from "react";
import type { FileSystemType, ViewStyle, FileType } from "../types";

interface ProviderInterface {
  fs: FileSystemType;
  currentFolder: string;
  setCurrentFolder: (id: string) => void;
  viewOnly?: boolean;
  onDoubleClick?: (id: string) => Promise<void>;
  onRefresh?: (id: string) => Promise<void>;
  onUpload?: (fileData: any, folderId: string, onProgress?: (p: number) => void) => Promise<void>;
  onCreateFolder?: (folderName: string) => Promise<void>;
  onDelete?: (fileId: string) => Promise<void>;
  onMove?: (id: string, newParentId: string) => Promise<void>;
  onRename?: (id: string, newName: string) => Promise<void>;
  uploadedFileData: any;
  setUploadedFileData: Dispatch<any>;
  viewStyle: ViewStyle,
  setViewStyle: Dispatch<ViewStyle>,
  uploadProgress: number;
  setUploadProgress: Dispatch<number>;
  isUploading: boolean;
  setIsUploading: Dispatch<boolean>;
  uploadFileName: string;
  setUploadFileName: Dispatch<string>;
  clipboard: FileType | null;
  setClipboard: Dispatch<FileType | null>;
  isCut: boolean;
  setIsCut: Dispatch<boolean>;
}

export const FileManagerContext = createContext<ProviderInterface | null>(null);

export const useFileManager = () => {
  const context = useContext(FileManagerContext);
  if (!context) {
    throw new Error("useFileManager must be used within FileManagerProvider");
  }
  return context;
};
