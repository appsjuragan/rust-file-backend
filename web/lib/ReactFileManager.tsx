import React, { useState } from "react";
// Context
import { FileManagerContext } from "./context";
// Components
import { Navbar, Workspace, Sidebar } from "./components";
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
}: IFileManagerProps) => {
  const [currentFolder, setCurrentFolder] = useState<string>("0"); // Root folder ID must be "0"
  const [uploadedFileData, setUploadedFileData] = useState<any>();
  const [viewStyle, setViewStyle] = useState<ViewStyle>(ViewStyle.List);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadFileName, setUploadFileName] = useState<string>("");
  const [clipboard, setClipboard] = useState<FileType | null>(null);
  const [isCut, setIsCut] = useState<boolean>(false);

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
      }}
    >
      <div className="rfm-main-container">
        <div className="rfm-content-container">
          <Sidebar />
          <Workspace />
        </div>
      </div>
    </FileManagerContext.Provider>
  );
};
