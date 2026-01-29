import React, { useState } from "react";
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
import { api } from "../src/api";
// Types
import type { FileSystemType, FileType } from "./types";
import { ViewStyle } from "./types";

export interface IFileManagerProps {
  fs: FileSystemType;
  viewOnly?: boolean;
  onDoubleClick?: (id: string) => Promise<void>;
  onRefresh?: (id: string) => Promise<void>;
  onUpload?: (fileData: any, folderId: string, onProgress?: (p: number) => void) => Promise<void>;
  onCreateFolder?: (folderName: string) => Promise<void>;
  onDelete?: (fileId: string) => Promise<void>;
  onMove?: (id: string, newParentId: string) => Promise<void>;
  onRename?: (id: string, newName: string) => Promise<void>;
  currentFolder?: string;
  setCurrentFolder?: (id: string) => void;
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
  currentFolder: propCurrentFolder,
  setCurrentFolder: propSetCurrentFolder,
}: IFileManagerProps) => {
  const [internalCurrentFolder, setInternalCurrentFolder] = useState<string>("0");
  const currentFolder = propCurrentFolder ?? internalCurrentFolder;
  const setCurrentFolder = propSetCurrentFolder ?? setInternalCurrentFolder;

  const [uploadedFileData, setUploadedFileData] = useState<any>();
  const [viewStyle, setViewStyle] = useState<ViewStyle>(ViewStyle.List);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadFileName, setUploadFileName] = useState<string>("");
  const [clipboard, setClipboard] = useState<FileType | null>(null);
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
        uploadedFileData: uploadedFileData,
        setUploadedFileData: setUploadedFileData,
        uploadProgress,
        setUploadProgress,
        isUploading,
        setIsUploading,
        uploadFileName,
        setUploadFileName,
        clipboard,
        setClipboard,
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
