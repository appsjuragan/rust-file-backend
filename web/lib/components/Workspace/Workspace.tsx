import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useFileManager } from "../../context";
import type { FileType } from "../../types";
import { ViewStyle } from "../../types";
import { isDescendantOrSelf, formatSize, formatMimeType } from "../../utils/fileUtils";

// Components
import FolderPath from "./FolderPath";
import { api } from "../../../src/api";
import { scanEntries } from "../../utils/upload";

// Modularized Workspace components
import { FileTable } from "./FileTable";
import { FileGrid } from "./FileGrid";
import { getColumns } from "./TableColumns";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import SvgIcon from "../Icons/SvgIcon";

const Workspace = () => {
  const {
    currentFolder,
    fs,
    viewStyle,
    viewOnly,
    setCurrentFolder,
    onRefresh,
    onUpload,
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
    setContextMenu,
    selectedIds,
    setSelectedIds,
    setDialogState,
    highlightedId,
    setHighlightedId,
    onLoadMore,
    hasMore,
    isLoadingMore,
    onDoubleClick: onPreviewRequest,
    setOpenUpload,
    setPreviewFile,
    setPreviewVisible,
  } = useFileManager();

  const [marquee, setMarquee] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setLastSelectedId(null);
  }, [currentFolder]);

  useEffect(() => {
    if (highlightedId) {
      setTimeout(() => {
        const element = document.querySelector(`[data-id="${highlightedId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setSelectedIds([highlightedId]);
        }
        setTimeout(() => {
          if (setHighlightedId) setHighlightedId(null);
        }, 3000);
      }, 100);
    }
  }, [highlightedId, currentFolder, setHighlightedId, setSelectedIds]);

  const handleDragStart = (e: React.DragEvent, file: FileType) => {
    if (file.scanStatus === 'pending' || file.scanStatus === 'scanning') {
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
  };

  const handleDragOver = (e: React.DragEvent, folder: FileType) => {
    e.preventDefault();
    if (folder.isDir) {
      setDragOverId(folder.id);
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDropOnFolder = async (e: React.DragEvent, folder: FileType) => {
    e.preventDefault();
    setDragOverId(null);

    const data = e.dataTransfer.getData("application/json");
    if (data) {
      const sourceIds = JSON.parse(data) as string[];
      if (folder.isDir) {
        const invalidMoves = sourceIds.filter(id => isDescendantOrSelf(fs, id, folder.id));
        if (invalidMoves.length > 0) {
          console.warn("Circular move or move to self prevented");
          return;
        }

        if (onBulkMove) {
          await onBulkMove(sourceIds, folder.id);
        } else if (onMove) {
          for (const id of sourceIds) {
            await onMove(id, folder.id);
          }
        }
        if (onRefresh) await onRefresh(currentFolder);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileType | null) => {
    e.preventDefault();
    if (file && !selectedIds.includes(file.id)) {
      setSelectedIds([file.id]);
    } else if (!file && selectedIds.length === 0) {
      // Empty space context menu
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file,
    });
  };

  const handleDrop = useCallback(async (acceptedFiles: File[], _fileRejections: any[], event: any) => {
    if (viewOnly) return;

    const targetFolderId = currentFolder;

    try {
      const droppedItems = (event as any).dataTransfer?.items;
      if (droppedItems) {
        const entries = await scanEntries(droppedItems);
        if (onUpload) await onUpload(entries, targetFolderId);
      } else {
        if (onUpload) {
          const uploadPayload = acceptedFiles.map(f => ({
            file: f,
            path: (f as any).path || f.name
          }));
          await onUpload(uploadPayload, targetFolderId);
        }
      }
      if (onRefresh) await onRefresh(targetFolderId);
    } catch (err) {
      console.error("Upload failed:", err);
    }
  }, [viewOnly, currentFolder, onUpload, onRefresh]);

  const { getRootProps, getInputProps, isDragAccept, open } = useDropzone({
    onDrop: handleDrop,
    noClick: true,
    noKeyboard: true
  });

  useEffect(() => {
    if (setOpenUpload) {
      setOpenUpload(open);
    }
  }, [open, setOpenUpload]);

  const currentFolderFiles = useMemo(() => {
    return fs.filter((f) => f.parentId === currentFolder);
  }, [fs, currentFolder]);

  const columns = useMemo(() => getColumns(), []);

  const table = useReactTable({
    data: currentFolderFiles,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleItemClick = (file: FileType, e: React.MouseEvent) => {
    e.stopPropagation();
    setContextMenu(null);

    if (e.ctrlKey || e.metaKey) {
      if (selectedIds.includes(file.id)) {
        setSelectedIds(selectedIds.filter(id => id !== file.id));
      } else {
        setSelectedIds([...selectedIds, file.id]);
      }
      setLastSelectedId(file.id);
    } else if (e.shiftKey && lastSelectedId) {
      const allIdsInOrder = currentFolderFiles.map(f => f.id);
      const startIdx = allIdsInOrder.indexOf(lastSelectedId);
      const endIdx = allIdsInOrder.indexOf(file.id);

      if (startIdx !== -1 && endIdx !== -1) {
        const rangeIds = allIdsInOrder.slice(
          Math.min(startIdx, endIdx),
          Math.max(startIdx, endIdx) + 1
        );
        setSelectedIds(Array.from(new Set([...selectedIds, ...rangeIds])));
      }
    } else {
      setSelectedIds([file.id]);
      setLastSelectedId(file.id);
    }
  };

  const handleDoubleClick = (file: FileType) => {
    if (file.scanStatus === 'pending' || file.scanStatus === 'scanning') return;
    if (file.isDir) {
      setCurrentFolder(file.id);
    } else {
      if (onPreviewRequest) {
        onPreviewRequest(file.id);
      } else {
        setPreviewFile(file);
        setPreviewVisible(true);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const container = document.getElementById("react-file-manager-workspace");
    if (!container) return;

    const startX = e.clientX;
    const startY = e.clientY;

    const rect = container.getBoundingClientRect();

    const mouseMoveHandler = (moveEvent: MouseEvent) => {
      const currentX = moveEvent.clientX;
      const currentY = moveEvent.clientY;

      setMarquee({
        x1: startX,
        y1: startY,
        x2: currentX,
        y2: currentY,
      });

      const marqueeRect = {
        left: Math.min(startX, currentX),
        top: Math.min(startY, currentY),
        right: Math.max(startX, currentX),
        bottom: Math.max(startY, currentY),
      };

      const items = container.querySelectorAll(".rfm-file-item");
      const newSelectedIds: string[] = [];

      items.forEach((item) => {
        const itemRect = item.getBoundingClientRect();
        if (
          itemRect.left < marqueeRect.right &&
          itemRect.right > marqueeRect.left &&
          itemRect.top < marqueeRect.bottom &&
          itemRect.bottom > marqueeRect.top
        ) {
          const id = item.getAttribute("data-id");
          if (id) newSelectedIds.push(id);
        }
      });

      setSelectedIds(newSelectedIds);
    };

    const mouseUpHandler = () => {
      setMarquee(null);
      document.removeEventListener("mousemove", mouseMoveHandler);
      document.removeEventListener("mouseup", mouseUpHandler);
    };

    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setSelectedIds(currentFolderFiles.map(f => f.id));
    }

    if (e.key === 'Escape') {
      setSelectedIds([]);
      setContextMenu(null);
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
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
              for (const id of selectedIds) {
                await onDelete(id);
              }
            }
            setSelectedIds([]);
          }
        });
      }
    }

    if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
      if (selectedIds.length > 0) {
        setClipboardIds(selectedIds);
        setIsCut(false);
      }
    }

    if (e.key === 'x' && (e.ctrlKey || e.metaKey)) {
      if (selectedIds.length > 0) {
        setClipboardIds(selectedIds);
        setIsCut(true);
      }
    }

    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      const handlePaste = async () => {
        if (clipboardIds.length > 0) {
          if (isCut) {
            if (onBulkMove) {
              await onBulkMove(clipboardIds, currentFolder);
            } else if (onMove) {
              for (const id of clipboardIds) {
                await onMove(id, currentFolder);
              }
            }
            setClipboardIds([]);
            setIsCut(false);
          } else {
            if (onBulkCopy) {
              await onBulkCopy(clipboardIds, currentFolder);
            }
          }
          if (onRefresh) await onRefresh(currentFolder);
        }
      };
      handlePaste();
    }
  }, [currentFolderFiles, selectedIds, onBulkDelete, onDelete, setSelectedIds, setContextMenu, setDialogState, setClipboardIds, setIsCut, currentFolder, onBulkMove, onMove, onBulkCopy, onRefresh]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
      <FolderPath />

      <div
        className="rfm-workspace-file-listing"
        onScroll={(e) => {
          const target = e.currentTarget;
          if (target.scrollHeight - target.scrollTop <= target.clientHeight + 100) {
            if (onLoadMore && hasMore && !isLoadingMore) {
              onLoadMore();
            }
          }
        }}
      >
        {viewStyle === ViewStyle.Icons && (
          <FileGrid
            currentFolderFiles={currentFolderFiles}
            selectedIds={selectedIds}
            dragOverId={dragOverId}
            highlightedId={highlightedId || null}
            handleItemClick={handleItemClick}
            handleDoubleClick={handleDoubleClick}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDropOnFolder={handleDropOnFolder}
            handleContextMenu={handleContextMenu}
          />
        )}

        {viewStyle === ViewStyle.List && (
          <FileTable
            table={table}
            selectedIds={selectedIds}
            dragOverId={dragOverId}
            highlightedId={highlightedId || null}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleDropOnFolder={handleDropOnFolder}
            handleContextMenu={handleContextMenu}
            handleItemClick={handleItemClick}
            handleDoubleClick={handleDoubleClick}
            currentFolderFiles={currentFolderFiles}
            columnsCount={columns.length}
          />
        )}

        {isLoadingMore && (
          <div className="rfm-loading-more">
            <div className="rfm-spinner-small"></div>
            Loading more...
          </div>
        )}
      </div>
    </section>
  );
};

export default Workspace;
