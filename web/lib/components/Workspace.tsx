import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useFileManager } from "../context";
import type { FileType } from "../types";
import { ViewStyle } from "../types";

// Components
import FileIcon from "./FileIcon";
import NewFolderIcon from "./NewFolderIcon";
import FolderPath from "./FolderPath";
import { api } from "../../src/api";
import { scanEntries } from "../utils/upload";



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

const formatMimeType = (mime?: string) => {
  if (!mime) return 'Unknown';

  if (mime.startsWith('image/')) return 'Image';
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';

  switch (mime) {
    case 'application/pdf': return 'PDF';
    case 'text/plain': return 'Text';
    case 'application/zip':
    case 'application/x-zip-compressed': return 'Zip Archive';

    // Microsoft Office
    case 'application/msword':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'Word Document';
    case 'application/vnd.ms-excel':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'Excel Spreadsheet';
    case 'application/vnd.ms-powerpoint':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'PowerPoint Presentation';

    default:
      // Try to clean up others if they are too long
      if (mime.length > 30) {
        const parts = mime.split('/');
        if (parts.length > 1 && parts[1]) {
          const subParts = parts[1].split(/[.-]/);
          if (subParts.length > 0 && subParts[0]) return subParts[0].toUpperCase();
        }
      }
      return mime;
  }
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
    cell: info => info.row.original.isDir ? 'Folder' : formatMimeType(info.getValue()),
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
    activeUploads,
    setActiveUploads,
    onDelete,
    onBulkDelete,
    onMove,
    onBulkMove,
    onBulkCopy,
    isCut,
    setIsCut,
    clipboardIds,
    setClipboardIds,
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
    setModalPosition,
    selectedIds,
    setSelectedIds,
    isMoving,
    setIsMoving,
    setDialogState,
  } = useFileManager();

  const [marquee, setMarquee] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setLastSelectedId(null);
  }, [currentFolder]);

  const handleDragStart = (e: React.DragEvent, file: FileType) => {
    if (file.scanStatus === 'pending') {
      e.preventDefault();
      return;
    }

    let idsToMove = selectedIds;
    if (!selectedIds.includes(file.id)) {
      idsToMove = [file.id];
      setSelectedIds(idsToMove);
    }

    e.dataTransfer.setData("application/json", JSON.stringify(idsToMove));
    e.dataTransfer.effectAllowed = "move";

    // Create a ghost image if multiple items
    if (idsToMove.length > 1) {
      const dragIcon = document.createElement("div");
      dragIcon.style.padding = "5px 10px";
      dragIcon.style.background = "#3b82f6";
      dragIcon.style.color = "white";
      dragIcon.style.borderRadius = "4px";
      dragIcon.style.position = "absolute";
      dragIcon.style.top = "-1000px";
      dragIcon.innerText = `Moving ${idsToMove.length} items`;
      document.body.appendChild(dragIcon);
      e.dataTransfer.setDragImage(dragIcon, 0, 0);
      setTimeout(() => document.body.removeChild(dragIcon), 0);
    }
  };

  const handleDragOver = (e: React.DragEvent, folder: FileType) => {
    if (!folder.isDir) return;

    // Don't allow dropping on itself or items being dragged
    const draggedIds = JSON.parse(e.dataTransfer.types.includes("application/json") ? "[]" : "[]"); // Can't read dataTransfer during dragover
    // Simplified: check if this is a directory and not already selected
    if (folder.isDir && !selectedIds.includes(folder.id)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverId(folder.id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDropOnFolder = async (e: React.DragEvent, folder: FileType) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);

    const data = e.dataTransfer.getData("application/json");
    if (!data) return;

    try {
      const idsToMove = JSON.parse(data);
      if (idsToMove.length > 0 && folder.id !== currentFolder) {
        setIsMoving(true);
        if (onBulkMove) {
          await onBulkMove(idsToMove, folder.id);
        } else if (onMove) {
          for (const id of idsToMove) await onMove(id, folder.id);
        }

        if (onRefresh) await onRefresh(currentFolder);
        setSelectedIds([]);
        setIsMoving(false);
      }
    } catch (err) {
      console.error("Move via DND failed", err);
      setIsMoving(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileType | null) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return;
    }
    e.preventDefault();

    // If clicking on an unselected file, select ONLY it
    if (file && !selectedIds.includes(file.id)) {
      setSelectedIds([file.id]);
    } else if (!file) {
      setSelectedIds([]);
    }

    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[], fileRejections: any[], event: any) => {
      if (onUpload) {
        try {
          let filesToUpload: { file: File, path: string }[] = [];

          // Try to get files with hierarchy from dataTransfer
          const dataTransfer = event?.dataTransfer || event?.nativeEvent?.dataTransfer;

          if (dataTransfer && dataTransfer.items && dataTransfer.items.length > 0) {
            console.log("Scanning dataTransfer items...", dataTransfer.items.length);
            filesToUpload = await scanEntries(dataTransfer.items);
            console.log("scanEntries result:", filesToUpload.length, filesToUpload);
          }

          // Fallback to acceptedFiles if scanEntries found nothing
          if (filesToUpload.length === 0 && acceptedFiles.length > 0) {
            console.log("Fallback to acceptedFiles");
            filesToUpload = acceptedFiles.map(f => ({
              file: f,
              path: (f as any).webkitRelativePath || f.name
            }));
          }

          if (filesToUpload.length > 0) {
            await onUpload(filesToUpload, currentFolder);
            if (onRefresh) await onRefresh(currentFolder);
          }
        } catch (e) {
          console.error("Upload failed", e);
        }
      }
    },
    [onUpload, onRefresh, currentFolder]
  );


  const { getRootProps, getInputProps, isDragAccept, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: onDrop,
  });

  const { setOpenUpload } = useFileManager();
  useEffect(() => {
    if (setOpenUpload) {
      setOpenUpload(() => open);
    }
  }, [open, setOpenUpload]);

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

  const handleItemClick = (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    if (file.scanStatus === 'pending') return;

    if (e.shiftKey && lastSelectedId) {
      const idx1 = currentFolderFiles.findIndex(f => f.id === lastSelectedId);
      const idx2 = currentFolderFiles.findIndex(f => f.id === file.id);
      if (idx1 !== -1 && idx2 !== -1) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        const rangeIds = currentFolderFiles.slice(start, end + 1).map(f => f.id);
        // If ctrl is also pressed, merge with existing selection (Windows behavior)
        if (e.ctrlKey || e.metaKey) {
          setSelectedIds(Array.from(new Set([...selectedIds, ...rangeIds])));
        } else {
          setSelectedIds(rangeIds);
        }
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (selectedIds.includes(file.id)) {
        setSelectedIds(selectedIds.filter(id => id !== file.id));
      } else {
        setSelectedIds([...selectedIds, file.id]);
      }
      setLastSelectedId(file.id);
    } else {
      setSelectedIds([file.id]);
      setLastSelectedId(file.id);
    }
  };

  const handleDoubleClick = (file: FileType) => {
    if (file.scanStatus === 'pending') return;
    if (file.isDir) {
      setCurrentFolder(file.id);
      if (onRefresh !== undefined) {
        onRefresh(file.id).catch(console.error);
      }
      setSelectedIds([]);
    } else {
      setPreviewFile(file);
      setPreviewVisible(true);
    }
    if (onDoubleClick) {
      onDoubleClick(file.id)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    const target = e.target as HTMLElement;
    if (target.closest('.rfm-workspace-list-icon-row') || target.closest('.rfm-icons-grid button')) {
      return;
    }

    const startX = e.clientX;
    const startY = e.clientY;

    e.preventDefault(); // Prevent text selection

    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      setSelectedIds([]);
    }

    const mouseMoveHandler = (moveEvent: MouseEvent) => {
      setMarquee({
        x1: startX,
        y1: startY,
        x2: moveEvent.clientX,
        y2: moveEvent.clientY
      });

      // Selection logic
      const xMin = Math.min(startX, moveEvent.clientX);
      const xMax = Math.max(startX, moveEvent.clientX);
      const yMin = Math.min(startY, moveEvent.clientY);
      const yMax = Math.max(startY, moveEvent.clientY);

      const items = document.querySelectorAll('.rfm-file-item');
      const newlySelected: string[] = [];

      items.forEach((elem) => {
        const rect = elem.getBoundingClientRect();
        const id = elem.getAttribute('data-id');
        if (!id) return;

        const overlaps = !(rect.right < xMin || rect.left > xMax || rect.bottom < yMin || rect.top > yMax);
        if (overlaps) {
          newlySelected.push(id);
        }
      });

      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        const combined = new Set([...selectedIds, ...newlySelected]);
        setSelectedIds(Array.from(combined));
      } else {
        setSelectedIds(newlySelected);
      }
    };

    const mouseUpHandler = () => {
      setMarquee(null);
      window.removeEventListener('mousemove', mouseMoveHandler);
      window.removeEventListener('mouseup', mouseUpHandler);
    };

    window.addEventListener('mousemove', mouseMoveHandler);
    window.addEventListener('mouseup', mouseUpHandler);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Ctrl + A: Select All
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(currentFolderFiles.map(f => f.id));
      }

      // Ctrl + C: Copy
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (selectedIds.length > 0) {
          setClipboardIds(selectedIds);
          setIsCut(false);
        }
      }

      // Ctrl + X: Cut
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        if (selectedIds.length > 0) {
          setClipboardIds(selectedIds);
          setIsCut(true);
        }
      }

      // Ctrl + V: Paste
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        if (clipboardIds.length > 0) {
          if (isCut) {
            setIsMoving(true);
            if (onBulkMove) {
              await onBulkMove(clipboardIds, currentFolder);
            } else if (onMove) {
              for (const id of clipboardIds) await onMove(id, currentFolder);
            }
            setClipboardIds([]);
            setIsCut(false);
            setIsMoving(false);
          } else {
            if (onBulkCopy) await onBulkCopy(clipboardIds, currentFolder);
          }
          if (onRefresh) await onRefresh(currentFolder);
        }
      }

      // Delete: Bulk Delete
      if (e.key === 'Delete') {
        e.preventDefault();
        if (selectedIds.length > 0) {
          setDialogState({
            isVisible: true,
            title: "Confirm Delete",
            message: `Are you sure you want to delete ${selectedIds.length} item(s)?`,
            type: "confirm",
            onConfirm: async () => {
              if (onBulkDelete) {
                await onBulkDelete(selectedIds);
              } else if (onDelete) {
                for (const id of selectedIds) await onDelete(id);
              }
              setSelectedIds([]);
            }
          });
        }
      }

      // F2: Rename
      if (e.key === 'F2') {
        e.preventDefault();
        if (selectedIds.length === 1) {
          const file = fs.find(f => f.id === selectedIds[0]);
          if (file) {
            setRenameFile(file);
            setRenameVisible(true);
          }
        }
      }

      // Enter: Open / Double Click
      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIds.length === 1) {
          const file = fs.find(f => f.id === selectedIds[0]);
          if (file) handleDoubleClick(file);
        }
      }

      // Alt + Enter: Properties
      if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        if (selectedIds.length === 1) {
          const file = fs.find(f => f.id === selectedIds[0]);
          if (file) {
            setMetadataFile(file);
            setMetadataVisible(true);
          }
        }
      }

      // Ctrl + Shift + N: New Folder
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setNewFolderModalVisible(true);
      }

      // Backspace: Go Up
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (currentFolder !== "0") {
          const folder = fs.find(f => f.id === currentFolder);
          if (folder) {
            setCurrentFolder(folder.parentId as any);
            if (onRefresh) onRefresh(folder.parentId as any).catch(console.error);
            setSelectedIds([]);
          }
        }
      }

      // Refresh: F5
      if (e.key === 'F5') {
        e.preventDefault();
        if (onRefresh) onRefresh(currentFolder).catch(console.error);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedIds,
    currentFolderFiles,
    clipboardIds,
    isCut,
    currentFolder,
    fs,
    onBulkMove,
    onMove,
    onBulkCopy,
    onBulkDelete,
    onDelete,
    onRefresh,
    setClipboardIds,
    setIsCut,
    setSelectedIds,
    setRenameFile,
    setRenameVisible,
    setMetadataFile,
    setMetadataVisible,
    setNewFolderModalVisible,
    setCurrentFolder,
    handleDoubleClick
  ]);

  return (
    <section
      id="react-file-manager-workspace"
      className={`rfm-workspace ${isDragAccept && !viewOnly ? "rfm-workspace-dropzone" : ""} ${marquee ? "rfm-selecting" : ""}`}
      {...getRootProps()}
      onContextMenu={(e) => handleContextMenu(e, null)}
      onClick={() => {
        setContextMenu(null);
        setSelectedIds([]);
      }}
      onMouseDown={handleMouseDown}
    >
      <input {...getInputProps()} />
      {marquee && (
        <div
          className="rfm-marquee-selection"
          style={{
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x1 - marquee.x2),
            height: Math.abs(marquee.y1 - marquee.y2),
          }}
        />
      )}
      {/* Top bar with folder path */}
      <FolderPath />


      {/* File listing */}
      <div className="rfm-workspace-file-listing">

        {/* Icons File View */}
        {viewStyle === ViewStyle.Icons && (
          <div className="rfm-icons-grid">
            {currentFolderFiles.map((f: FileType, key: number) => {
              const isPending = f.scanStatus === 'pending';
              const isSelected = selectedIds.includes(f.id);
              return (
                <button
                  onClick={(e) => handleItemClick(f, e)}
                  onDoubleClick={() => handleDoubleClick(f)}
                  key={key}
                  data-id={f.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, f)}
                  onDragOver={(e) => handleDragOver(e, f)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDropOnFolder(e, f)}
                  onContextMenu={(e) => {
                    if (isPending) return;
                    e.stopPropagation();
                    handleContextMenu(e, f);
                  }}
                  className={`rfm-file-item ${isPending ? "rfm-pending" : ""} ${isSelected ? "rfm-selected" : ""} ${dragOverId === f.id ? "rfm-drag-over" : ""}`}
                  disabled={isPending}
                >
                  <FileIcon id={f.id} name={f.name} isDir={f.isDir} />
                  {isPending && <div className="rfm-scanning-overlay">Scanning...</div>}
                </button>
              )
            }
            )}
            {!viewOnly && (
              <div className="rfm-file-item">
                <NewFolderIcon onClick={(e) => {
                  setModalPosition({ x: e.clientX, y: e.clientY });
                  setNewFolderModalVisible(true);
                }} />
              </div>
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
                {table.getRowModel().rows.map(row => {
                  const isSelected = selectedIds.includes(row.original.id);
                  return (
                    <tr
                      key={row.id}
                      data-id={row.original.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, row.original)}
                      onDragOver={(e) => handleDragOver(e, row.original)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDropOnFolder(e, row.original)}
                      className={`rfm-file-item rfm-workspace-list-icon-row ${row.original.scanStatus === 'pending' ? 'rfm-pending' : ''} ${isSelected ? "rfm-selected" : ""} ${dragOverId === row.original.id ? "rfm-drag-over" : ""}`}
                      onContextMenu={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, row.original);
                      }}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td className="rfm-workspace-list-align-txt" key={cell.id} onClick={(e) => handleItemClick(row.original, e)} onDoubleClick={() => handleDoubleClick(row.original)}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {currentFolderFiles.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="py-10 text-center">
                      <div
                        className="rfm-empty-folder"
                        onContextMenu={(e) => {
                          e.stopPropagation();
                          handleContextMenu(e, null);
                        }}
                      >
                        <p>Empty folder</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}



      </div>
    </section>
  );
};

export default Workspace;
