import React, { useState, useEffect } from "react";
// Context
import { FileManagerContext } from "./context";
// Components
import { Navbar, Workspace, Sidebar } from "./components";
import NewFolderModal from "./components/NewFolderModal";
import PreviewModal from "./components/PreviewModal";
import UploadProgressToast from "./components/UploadProgressToast";
import ContextMenu from "./components/ContextMenu";
import MetadataModal from "./components/MetadataModal";
import RenameModal from "./components/RenameModal";
import OperationToast from "./components/OperationToast";
import DialogModal from "./components/DialogModal";
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
  const [openUpload, setOpenUpload] = useState<(() => void) | null>(null);
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

  return (
    <FileManagerContext.Provider
      value={{
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
        openUpload: openUpload || undefined,
        setOpenUpload,
        modalPosition,
        setModalPosition,
        isMoving,
        setIsMoving,
        dialogState,
        setDialogState,
        showAlert,
        showConfirm,
        userFacts,
      }}
    >

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
                fileUrl={api.getFileUrl(previewFile.id)}
                mimeType={previewFile.mimeType}
                size={previewFile.size}
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
            onUpload={() => openUpload?.()}
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
