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
    setUploadProgress,
    setIsUploading,
    setUploadFileName,
  } = useFileManager();
  const [newFolderModalVisible, setNewFolderModalVisible] =
    useState<boolean>(false);
  const [previewVisible, setPreviewVisible] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<FileType | null>(null);
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
      const file = acceptedFiles[0];
      if (file && onUpload) {
        try {
          setUploadFileName(file.name);
          setUploadProgress(0);
          setIsUploading(true);
          await onUpload([file], currentFolder, (p) => {
            setUploadProgress(p);
          });
          if (onRefresh) await onRefresh(currentFolder);
          // Keep toast visible for a moment if 100%
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
          <>
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
          </>
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
                    className="rfm-workspace-list-icon-row"
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
            {!viewOnly && (
              <div className="rfm-workspace-actions">
                <button className="rfm-btn-primary" onClick={() => setNewFolderModalVisible(true)}>Add Folder</button>
                <button className="rfm-btn-primary" onClick={open}>Upload File(s)</button>
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
          />
        )}
      </div>
    </section>
  );
};

export default Workspace;
