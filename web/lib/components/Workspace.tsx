import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useFileManager } from "../context";
import type { FileType } from "../types";
import { ViewStyle } from "../types";

// Components
import FileIcon from "./FileIcon";
import NewFolderIcon from "./NewFolderIcon";
import FolderPath from "./FolderPath";
import NewFolderModal from "./NewFolderModal";
import PreviewModal from "./PreviewModal";
import UploadProgressToast from "./UploadProgressToast";
import ContextMenu from "./ContextMenu";
import MetadataModal from "./MetadataModal";
import RenameModal from "./RenameModal";
import { api } from "../../src/api";


import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import SvgIcon from "./SvgIcon";


const columnHelper = createColumnHelper<FileType>()

const formatSize = (bytes?: number) => {
  if (bytes === undefined || bytes === null) return '--';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const columns = [
  columnHelper.accessor('name', {
    header: () => 'Name',
    cell: info => {
      const isPending = info.row.original.scanStatus === 'pending';
      return (
        <div className={`rfm-workspace-list-icon-td ${isPending ? 'rfm-pending' : ''}`}>
          <SvgIcon svgType={info.row.original.isDir ? "folder" : "file"} className="rfm-workspace-list-icon" />
          <p>{info.getValue()}</p>
          {isPending && <span className="rfm-scanning-badge">Scanning...</span>}
        </div>
      );
    },
  }),
  columnHelper.accessor('size', {
    header: () => 'Size',
    cell: info => info.row.original.isDir ? '--' : formatSize(info.getValue()),
  }),
  columnHelper.accessor('mimeType', {
    header: () => 'Type',
    cell: info => info.row.original.isDir ? 'Folder' : (info.getValue() || 'Unknown'),
  }),
  columnHelper.accessor('lastModified', {
    header: () => 'Last Modified',
    cell: info => info.getValue() ? new Date((info.getValue() as number) * 1000).toLocaleString() : 'N/A',
  }),
]

const Workspace = () => {
  const {
    currentFolder,
    fs,
    viewStyle,
    viewOnly,
    setCurrentFolder,
    onDoubleClick,
    onRefresh,
    onUpload,
    onRename,
    setUploadProgress,
    setIsUploading,
    setUploadFileName,
  } = useFileManager();
  const [newFolderModalVisible, setNewFolderModalVisible] =
    useState<boolean>(false);
  const [previewVisible, setPreviewVisible] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<FileType | null>(null);
  const [metadataVisible, setMetadataVisible] = useState<boolean>(false);
  const [metadataFile, setMetadataFile] = useState<FileType | null>(null);
  const [renameVisible, setRenameVisible] = useState<boolean>(false);
  const [renameFile, setRenameFile] = useState<FileType | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileType | null } | null>(null);

  useEffect(() => {
    if (newFolderModalVisible) {
      setNewFolderModalVisible(false);
    }
  }, [currentFolder]);

  const handleContextMenu = (e: React.MouseEvent, file: FileType | null) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0 && onUpload) {
        try {
          setIsUploading(true);
          setUploadProgress(0);

          if (acceptedFiles.length === 1 && acceptedFiles[0]) {
            setUploadFileName(acceptedFiles[0].name);
          } else {
            setUploadFileName(`Uploading ${acceptedFiles.length} files...`);
          }

          await onUpload(acceptedFiles, currentFolder, (p) => {
            setUploadProgress(p);
          });

          if (onRefresh) await onRefresh(currentFolder);

          setTimeout(() => {
            setIsUploading(false);
          }, 2000);
        } catch (e) {
          console.error("Upload failed", e);
          setIsUploading(false);
        }
      }
    },
    [onUpload, onRefresh, currentFolder, setUploadFileName, setUploadProgress, setIsUploading]
  );

  const { getRootProps, getInputProps, isDragAccept, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: onDrop,
  });

  const currentFolderFiles = useMemo(() => {
    const files = fs.filter((f: FileType) => f.parentId === currentFolder);
    return files;
  }, [fs, currentFolder]);

  const table = useReactTable({
    data: currentFolderFiles, columns, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    initialState: {
      sorting: [{ id: 'name', desc: false }],
    },
  })

  const handleClick = async (file: FileType) => {
    if (file.scanStatus === 'pending') return;

    if (file.isDir) {
      setCurrentFolder(file.id);
      if (onRefresh !== undefined) {
        try {
          await onRefresh(file.id);
        } catch (e) {
          throw new Error("Error during refresh");
        }
      }
    } else {
      // Preview media files on click
      setPreviewFile(file);
      setPreviewVisible(true);
    }

  };

  const handleDoubleClick = (file: FileType) => {
    if (file.scanStatus === 'pending') return;
    if (onDoubleClick) {
      onDoubleClick(file.id)
    }
  }

  return (
    <section
      id="react-file-manager-workspace"
      className={`rfm-workspace ${isDragAccept && !viewOnly ? "rfm-workspace-dropzone" : ""
        }`}
      {...getRootProps()}
      onContextMenu={(e) => handleContextMenu(e, null)}
      onClick={() => setContextMenu(null)}
    >
      <input {...getInputProps()} />
      {/* Top bar with folder path */}
      <FolderPath />

      {/* File listing */}
      <div className="rfm-workspace-file-listing">

        {/* Icons File View */}
        {viewStyle === ViewStyle.Icons && (
          <div className="rfm-icons-grid">
            {currentFolderFiles.map((f: FileType, key: number) => {
              const isPending = f.scanStatus === 'pending';
              return (
                <button
                  onDoubleClick={() => handleDoubleClick(f)}
                  key={key}
                  onContextMenu={(e) => {
                    if (isPending) return;
                    e.stopPropagation();
                    handleContextMenu(e, f);
                  }}
                  className={isPending ? "rfm-pending" : ""}
                  disabled={isPending}
                >
                  <FileIcon id={f.id} name={f.name} isDir={f.isDir} />
                  {isPending && <div className="rfm-scanning-overlay">Scanning...</div>}
                </button>
              )
            }
            )}
            {!viewOnly && (
              <NewFolderIcon onClick={() => setNewFolderModalVisible(true)} />
            )}
          </div>
        )}

        {/* List File View */}
        {viewStyle === ViewStyle.List && (
          <>
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th className="rfm-workspace-list-th" key={header.id} onClick={header.column.getToggleSortingHandler()}>
                        <div className="rfm-workspace-list-th-content">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() ? (header.column.getIsSorted() === 'desc' ? <SvgIcon svgType="arrow-down" className="rfm-header-sort-icon" /> : <SvgIcon svgType="arrow-up" className="rfm-header-sort-icon" />) : ''}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map(row => (
                  <tr
                    key={row.id}
                    className={`rfm-workspace-list-icon-row ${row.original.scanStatus === 'pending' ? 'rfm-pending' : ''}`}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      handleContextMenu(e, row.original);
                    }}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td className="rfm-workspace-list-align-txt" key={cell.id} onClick={() => handleClick(row.original)} onDoubleClick={() => handleDoubleClick(row.original)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {currentFolderFiles.length === 0 && (
              <div
                className="rfm-empty-folder"
                onContextMenu={(e) => {
                  e.stopPropagation();
                  handleContextMenu(e, null);
                }}
              >
                <p>Empty folder</p>
              </div>
            )}
          </>
        )}


        {!viewOnly && (
          <>
            <NewFolderModal
              isVisible={newFolderModalVisible}
              onClose={() => setNewFolderModalVisible(false)}
            />
            {previewFile && (
              <PreviewModal
                isVisible={previewVisible}
                onClose={() => setPreviewVisible(false)}
                fileName={previewFile.name}
                fileUrl={api.getFileUrl(previewFile.id)}
                mimeType={previewFile.mimeType}
                size={previewFile.size}
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
              setPreviewFile(file);
              setPreviewVisible(true);
            }}
            onViewMetadata={(file) => {
              setMetadataFile(file);
              setMetadataVisible(true);
            }}
            onRename={(file) => {
              setRenameFile(file);
              setRenameVisible(true);
            }}
            onNewFolder={() => setNewFolderModalVisible(true)}
            onUpload={open}
          />
        )}
        <MetadataModal
          isVisible={metadataVisible}
          onClose={() => setMetadataVisible(false)}
          file={metadataFile}
        />
        <RenameModal
          isVisible={renameVisible}
          onClose={() => setRenameVisible(false)}
          currentName={renameFile?.name || ""}
          onRename={(newName) => {
            if (renameFile && onRename) {
              onRename(renameFile.id, newName);
            }
          }}
        />
      </div>
    </section>
  );
};

export default Workspace;
