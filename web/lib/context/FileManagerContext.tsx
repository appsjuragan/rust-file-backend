import type { Dispatch } from "react";
import { createContext, useContext } from "react";
import type { FileSystemType, ViewStyle, FileType, UploadStatus } from "../types";

interface ProviderInterface {
  fs: FileSystemType;
  currentFolder: string;
  setCurrentFolder: (id: string) => void;
  viewOnly?: boolean;
  onDoubleClick?: (id: string) => Promise<void>;
  onRefresh?: (id: string) => Promise<void>;
  onUpload?: (files: { file: File, path: string }[], folderId: string) => Promise<void>;
  onCreateFolder?: (folderName: string) => Promise<void>;
  onDelete?: (fileId: string) => Promise<void>;
  onMove?: (id: string, newParentId: string) => Promise<void>;
  onRename?: (id: string, newName: string) => Promise<void>;
  uploadedFileData: any;
  setUploadedFileData: Dispatch<any>;
  viewStyle: ViewStyle,
  setViewStyle: Dispatch<ViewStyle>,
  activeUploads: UploadStatus[];
  setActiveUploads: (val: UploadStatus[] | ((prev: UploadStatus[]) => UploadStatus[])) => void;
  selectedIds: string[];
  setSelectedIds: Dispatch<string[]>;
  clipboardIds: string[];
  setClipboardIds: Dispatch<string[]>;
  isCut: boolean;
  setIsCut: Dispatch<boolean>;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  onBulkMove?: (ids: string[], newParentId: string) => Promise<void>;
  onBulkCopy?: (ids: string[], newParentId: string) => Promise<void>;
  // Modal states
  newFolderModalVisible: boolean;
  setNewFolderModalVisible: Dispatch<boolean>;
  previewVisible: boolean;
  setPreviewVisible: Dispatch<boolean>;
  previewFile: FileType | null;
  setPreviewFile: Dispatch<FileType | null>;
  metadataVisible: boolean;
  setMetadataVisible: Dispatch<boolean>;
  metadataFile: FileType | null;
  setMetadataFile: Dispatch<FileType | null>;
  renameVisible: boolean;
  setRenameVisible: Dispatch<boolean>;
  renameFile: FileType | null;
  setRenameFile: Dispatch<FileType | null>;
  contextMenu: { x: number; y: number; file: FileType | null } | null;
  setContextMenu: Dispatch<{ x: number; y: number; file: FileType | null } | null>;
  openUpload?: () => void;
  setOpenUpload: Dispatch<(() => void) | null>;
  modalPosition: { x: number; y: number } | null;
  setModalPosition: Dispatch<{ x: number; y: number } | null>;
  isMoving: boolean;
  setIsMoving: Dispatch<boolean>;
  dialogState: {
    isVisible: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
    onCancel?: () => void;
  };
  setDialogState: Dispatch<{
    isVisible: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
    onCancel?: () => void;
  }>;
  showAlert: (message: string, title?: string) => void;
  showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
}

export const FileManagerContext = createContext<ProviderInterface | null>(null);

export const useFileManager = () => {
  const context = useContext(FileManagerContext);
  if (!context) {
    throw new Error("useFileManager must be used within FileManagerProvider");
  }
  return context;
};
