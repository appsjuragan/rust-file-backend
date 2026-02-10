import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
// Context
import { FileManagerContext } from "./context";
// Components
import {
  Navbar,
  Workspace,
  Sidebar,
  NewFolderModal,
  PreviewModal,
  UploadProgressToast,
  ContextMenu,
  MetadataModal,
  RenameModal,
  OperationToast,
  DialogModal
} from "./components";
import { api } from "../src/api";
// Types
import type { FileSystemType, FileType } from "./types";
import { ViewStyle, UploadStatus } from "./types";

export interface IFileManagerProps {
  fs: FileSystemType;
  viewOnly?: boolean;
  onDoubleClick?: (id: string) => Promise<void>;
  onRefresh?: (id: string) => Promise<void>;
  onUpload?: (files: { file: File, path: string }[], folderId: string) => Promise<void>;
  onCreateFolder?: (folderName: string) => Promise<void>;
  onDelete?: (fileId: string) => Promise<void>;
  onMove?: (id: string, newParentId: string) => Promise<void>;
  onRename?: (id: string, newName: string) => Promise<void>;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  onBulkMove?: (ids: string[], newParentId: string) => Promise<void>;
  onBulkCopy?: (ids: string[], newParentId: string) => Promise<void>;
  currentFolder?: string;
  setCurrentFolder?: (id: string) => void;
  activeUploads?: UploadStatus[];
  setActiveUploads?: (val: UploadStatus[] | ((prev: UploadStatus[]) => UploadStatus[])) => void;
  userFacts?: any;
  highlightedId?: string | null;
  setHighlightedId?: (id: string | null) => void;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

export const ReactFileManager = ({
  fs,
  viewOnly,
  onDoubleClick,
  onRefresh,
  onUpload,
  onCreateFolder,
  onDelete,
  onMove,
  onRename,
  onBulkDelete,
  onBulkMove,
  onBulkCopy,
  currentFolder: propCurrentFolder,
  setCurrentFolder: propSetCurrentFolder,
  activeUploads: propActiveUploads,
  setActiveUploads: propSetActiveUploads,
  userFacts,
  highlightedId,
  setHighlightedId,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: IFileManagerProps) => {
  const [internalCurrentFolder, setInternalCurrentFolder] = useState<string>("0");
  const currentFolder = propCurrentFolder ?? internalCurrentFolder;
  const setCurrentFolder = propSetCurrentFolder ?? setInternalCurrentFolder;

  const [uploadedFileData, setUploadedFileData] = useState<any>();
  const [viewStyle, setViewStyle] = useState<ViewStyle>(ViewStyle.List);
  const [internalActiveUploads, setInternalActiveUploads] = useState<UploadStatus[]>([]);
  const activeUploads = propActiveUploads ?? internalActiveUploads;
  const setActiveUploads = (val: any) => {
    if (propSetActiveUploads) {
      propSetActiveUploads(val);
    } else {
      setInternalActiveUploads(val);
    }
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboardIds, setClipboardIds] = useState<string[]>([]);
  const [isCut, setIsCut] = useState<boolean>(false);
  const [newFolderModalVisible, setNewFolderModalVisible] = useState<boolean>(false);
  const [previewVisible, setPreviewVisible] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<FileType | null>(null);
  const [metadataVisible, setMetadataVisible] = useState<boolean>(false);
  const [metadataFile, setMetadataFile] = useState<FileType | null>(null);
  const [renameVisible, setRenameVisible] = useState<boolean>(false);
  const [renameFile, setRenameFile] = useState<FileType | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileType | null } | null>(null);
  const [openUploadDummy, setOpenUploadDummy] = useState<number>(0);
  const openUploadRef = useRef<(() => void) | null>(null);

  const triggerOpenUpload = useCallback(() => {
    openUploadRef.current?.();
  }, []);

  const registerOpenUpload = useCallback((fn: (() => void) | null) => {
    openUploadRef.current = fn;
    setOpenUploadDummy(prev => prev + 1); // Only to trigger re-render of components using the trigger if needed, but ContextMenu uses triggerOpenUpload which is STABLE
  }, []);
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | null>(null);
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [dialogState, setDialogState] = useState<{
    isVisible: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    isVisible: false,
    title: "",
    message: "",
    type: 'alert',
  });

  const showAlert = (message: string, title: string = "Alert") => {
    setDialogState({
      isVisible: true,
      title,
      message,
      type: 'alert',
    });
  };

  const showConfirm = (message: string, onConfirm: () => void, title: string = "Confirm") => {
    setDialogState({
      isVisible: true,
      title,
      message,
      type: 'confirm',
      onConfirm,
    });
  };

  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (message: any) => {
      showAlert(String(message));
    };
    return () => {
      window.alert = originalAlert;
    };
  }, [showAlert]);

  const contextValue = useMemo(() => ({
    fs: fs,
    viewStyle: viewStyle,
    setViewStyle: setViewStyle,
    viewOnly: viewOnly,
    currentFolder: currentFolder,
    setCurrentFolder: setCurrentFolder,
    onDoubleClick: onDoubleClick,
    onRefresh: onRefresh,
    onUpload: onUpload,
    onCreateFolder: onCreateFolder,
    onDelete: onDelete,
    onMove: onMove,
    onRename: onRename,
    onBulkDelete,
    onBulkMove,
    onBulkCopy,
    uploadedFileData: uploadedFileData,
    setUploadedFileData: setUploadedFileData,
    activeUploads,
    setActiveUploads,
    selectedIds,
    setSelectedIds,
    clipboardIds,
    setClipboardIds,
    isCut,
    setIsCut,
    newFolderModalVisible,
    setNewFolderModalVisible,
    previewVisible,
    setPreviewVisible,
    previewFile,
    setPreviewFile,
    metadataVisible,
    setMetadataVisible,
    metadataFile,
    setMetadataFile,
    renameVisible,
    setRenameVisible,
    renameFile,
    setRenameFile,
    contextMenu,
    setContextMenu,
    openUpload: triggerOpenUpload,
    setOpenUpload: registerOpenUpload,
    modalPosition,
    setModalPosition,
    isMoving,
    setIsMoving,
    dialogState,
    setDialogState,
    showAlert,
    showConfirm,
    userFacts,
    highlightedId,
    setHighlightedId,
    onLoadMore,
    hasMore,
    isLoadingMore,
  }), [
    fs, viewStyle, viewOnly, currentFolder, onDoubleClick, onRefresh, onUpload, onCreateFolder,
    onDelete, onMove, onRename, onBulkDelete, onBulkMove, onBulkCopy, uploadedFileData,
    activeUploads, selectedIds, clipboardIds, isCut, newFolderModalVisible, previewVisible,
    previewFile, metadataVisible, metadataFile, renameVisible, renameFile, contextMenu,
    triggerOpenUpload, registerOpenUpload, modalPosition, isMoving, dialogState, userFacts, highlightedId,
    hasMore, isLoadingMore, propSetCurrentFolder, propSetActiveUploads
  ]);

  return (
    <FileManagerContext.Provider value={contextValue}>

      <div className="rfm-main-container">
        <div className="rfm-content-container">
          <Sidebar />
          <Workspace />
        </div>
        {!viewOnly && (
          <>
            <NewFolderModal
              isVisible={newFolderModalVisible}
              onClose={() => setNewFolderModalVisible(false)}
              clickPosition={modalPosition}
            />
            {previewFile && (
              <PreviewModal
                isVisible={previewVisible}
                onClose={() => setPreviewVisible(false)}
                fileName={previewFile.name}
                fileId={previewFile.id}
                mimeType={previewFile.mimeType}
                size={previewFile.size}
                scanStatus={previewFile.scanStatus}
                clickPosition={modalPosition}
              />
            )}
          </>
        )}
        <UploadProgressToast />
        <OperationToast />
        <DialogModal />
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            file={contextMenu.file}
            onClose={() => setContextMenu(null)}
            onPreview={(file) => {
              setModalPosition({ x: contextMenu.x, y: contextMenu.y });
              setPreviewFile(file);
              setPreviewVisible(true);
            }}
            onViewMetadata={(file) => {
              setModalPosition({ x: contextMenu.x, y: contextMenu.y });
              setMetadataFile(file);
              setMetadataVisible(true);
            }}
            onRename={(file) => {
              setModalPosition({ x: contextMenu.x, y: contextMenu.y });
              setRenameFile(file);
              setRenameVisible(true);
            }}
            onNewFolder={() => {
              setModalPosition({ x: contextMenu.x, y: contextMenu.y });
              setNewFolderModalVisible(true);
            }}
            onUpload={triggerOpenUpload}
          />
        )}
        <MetadataModal
          isVisible={metadataVisible}
          onClose={() => setMetadataVisible(false)}
          file={metadataFile}
          clickPosition={modalPosition}
        />
        <RenameModal
          isVisible={renameVisible}
          onClose={() => setRenameVisible(false)}
          currentName={renameFile?.name || ""}
          clickPosition={modalPosition}
          onRename={(newName) => {
            if (renameFile && onRename) {
              onRename(renameFile.id, newName);
            }
          }}
        />
      </div>
    </FileManagerContext.Provider>
  );
};
