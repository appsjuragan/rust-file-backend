import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useFileManager } from "../../context";
import type { FileType } from "../../types";
import { ViewStyle } from "../../types";
import { isDescendantOrSelf, formatSize, formatMimeType } from "../../utils/fileUtils";
import { useFileActions } from "../../hooks/useFileActions";
import { useMediaQuery } from "../../hooks/useMediaQuery";

// Components
import FolderPath from "./FolderPath";
import { scanEntries } from "../../utils/upload";

// Modularized Workspace components
import { FileTable } from "./FileTable";
import { FileGrid } from "./FileGrid";
import { getColumns } from "./TableColumns";

// Modals
import NewTextFileModal from "../Modals/NewTextFileModal";

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
    filesByParent,
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
    resetUploadToastCountdown,
    newFolderModalVisible,
    setNewFolderModalVisible,
    renameVisible,
    setRenameVisible,
    renameFile,
    metadataVisible,
    setMetadataVisible,
    metadataFile,
    previewVisible,
    previewFile,
    onCreateFolder,
    onRename,
    openUpload: triggerOpenUpload,
    clipboardSourceFolder,
    setClipboardSourceFolder,
    iconSize
  } = useFileManager();

  const [marquee, setMarquee] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const [newTextFileModalVisible, setNewTextFileModalVisible] = useState(false);
  const didDragSelectionRef = React.useRef(false);

  // Breadcrumb visibility state
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollTopRef = React.useRef(0);
  const scrollThreshold = 10;

  const { handlePaste } = useFileActions();

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
        // Build a map for O(1) lookups during the check
        const fsMap = new Map(fs.map(f => [f.id, f]));
        const invalidMoves = sourceIds.filter(id => isDescendantOrSelf(fsMap, id, folder.id));
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

  const isMobile = !useMediaQuery("(min-width: 769px)");

  const handleContextMenu = (e: React.MouseEvent | { clientX: number, clientY: number }, file: FileType | null) => {
    if ('preventDefault' in e) e.preventDefault();
    if (viewOnly) return;

    if (file && !selectedIds.includes(file.id)) {
      setSelectedIds([file.id]);
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

  // handlePaste is now provided by useFileActions hook
  // Keyboard shortcut effect for paste would invoke handlePaste() directly if needed here
  // But wait, handlePaste was previously defined with useCallback here.
  // We need to ensure the hook's handlePaste is stable or wrapped if passed to deps.
  // Since useFileActions creates stable callbacks, we can just remove the local definition.

  useEffect(() => {
    if (setOpenUpload) {
      setOpenUpload(open);
    }
  }, [open, setOpenUpload]);

  const currentFolderFiles = useMemo(() => {
    return filesByParent?.get(currentFolder) || [];
  }, [filesByParent, currentFolder]);

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

    // Call reset countdown on any item click as well
    if (resetUploadToastCountdown) resetUploadToastCountdown();

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
    } else if (isMobile && selectedIds.length > 0) {
      // Mobile-friendly multi-select: toggle selection if already in selection mode
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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only left click
    if (e.button !== 0) return;

    // Check if clicking on a file item or interactive element
    const target = e.target as HTMLElement;
    if (target.closest(".rfm-file-item") || target.closest("button") || target.closest("input")) {
      return;
    }

    const container = document.getElementById("react-file-manager-workspace");
    if (!container) return;

    const startX = e.clientX;
    const startY = e.clientY;

    // Capture initial selection state for modifiers
    // Standard behavior: Ctrl/Shift/Meta adds to selection or preserves it
    const isAdditive = e.ctrlKey || e.metaKey || e.shiftKey;
    const initialSelectionIds = isAdditive ? new Set(selectedIds) : new Set<string>();

    // Reset drag flag
    didDragSelectionRef.current = false;

    const mouseMoveHandler = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault(); // Prevent text selection

      const currentX = moveEvent.clientX;
      const currentY = moveEvent.clientY;

      // Check for significant movement to count as drag
      if (!didDragSelectionRef.current && (Math.abs(currentX - startX) > 4 || Math.abs(currentY - startY) > 4)) {
        didDragSelectionRef.current = true;
      }

      setMarquee({
        x1: startX,
        y1: startY,
        x2: currentX,
        y2: currentY
      });

      const marqueeRect = {
        left: Math.min(startX, currentX),
        top: Math.min(startY, currentY),
        right: Math.max(startX, currentX),
        bottom: Math.max(startY, currentY),
      };

      // Query items dynamically to ensure we get correct positions (handles scrolling)
      // While caching is faster, dynamic query is more robust for scrolling containers
      const items = container.querySelectorAll(".rfm-file-item");
      const nextSelection = new Set(initialSelectionIds);

      items.forEach((item) => {
        const rect = item.getBoundingClientRect();

        // Check intersection
        if (
          rect.left < marqueeRect.right &&
          rect.right > marqueeRect.left &&
          rect.top < marqueeRect.bottom &&
          rect.bottom > marqueeRect.top
        ) {
          const id = item.getAttribute("data-id");
          if (id) nextSelection.add(id);
        }
      });

      setSelectedIds(Array.from(nextSelection));
    };

    const mouseUpHandler = () => {
      setMarquee(null);
      document.removeEventListener("mousemove", mouseMoveHandler);
      document.removeEventListener("mouseup", mouseUpHandler);
    };

    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);
  }, [selectedIds, setSelectedIds]);

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
        setClipboardSourceFolder(currentFolder);
      }
    }

    if (e.key === 'x' && (e.ctrlKey || e.metaKey)) {
      if (selectedIds.length > 0) {
        setClipboardIds(selectedIds);
        setIsCut(true);
        setClipboardSourceFolder(currentFolder);
      }
    }

    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
      handlePaste();
    }
  }, [currentFolderFiles, selectedIds, onBulkDelete, onDelete, setSelectedIds, setContextMenu, setDialogState, setClipboardIds, setIsCut, currentFolder, onBulkMove, onMove, onBulkCopy, onRefresh, handlePaste]);

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
      onClick={(e) => {
        // If a drag selection occurred, do not clear the selection on mouse up/click
        if (didDragSelectionRef.current) {
          didDragSelectionRef.current = false;
          return;
        }
        setContextMenu(null);
        setSelectedIds([]);
        if (resetUploadToastCountdown) resetUploadToastCountdown();
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
      <FolderPath visible={showHeader} />

      <div
        className="rfm-workspace-file-listing"
        onScroll={(e) => {
          const target = e.currentTarget;
          const currentScrollTop = target.scrollTop;

          // Auto-hide breadcrumb logic (Mobile only)
          if (window.innerWidth <= 768 && Math.abs(currentScrollTop - lastScrollTopRef.current) > scrollThreshold) {
            if (currentScrollTop > lastScrollTopRef.current) {
              // User is scrolling DOWN - hide header
              if (showHeader) setShowHeader(false);
            } else {
              // User is scrolling UP - show header
              if (!showHeader) setShowHeader(true);
            }
          } else if (window.innerWidth > 768 && !showHeader) {
            setShowHeader(true);
          }
          lastScrollTopRef.current = currentScrollTop;

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
            iconSize={iconSize}
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
            iconSize={iconSize}
          />
        )}

        {isLoadingMore && (
          <div className="rfm-loading-more">
            <div className="rfm-spinner-small"></div>
            Loading more...
          </div>
        )}
      </div>

      {/* Floating Action Button for Mobile */}
      {
        !viewOnly && (
          <>
            {/* Backdrop for FAB Menu */}
            {fabMenuOpen && (
              <div
                className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[4500]"
                onClick={() => setFabMenuOpen(false)}
              />
            )}

            <div className={`rfm-fab-menu ${fabMenuOpen ? 'active' : ''}`}>
              <div className="rfm-fab-item" onClick={() => { setNewFolderModalVisible && setNewFolderModalVisible(true); setFabMenuOpen(false); }}>
                <div className="rfm-fab-action">
                  <span className="rfm-fab-action-label">New Folder</span>
                  <div className="rfm-fab-action-icon">
                    <SvgIcon svgType="folder" />
                  </div>
                </div>
              </div>
              <div className="rfm-fab-item" onClick={() => { setNewTextFileModalVisible && setNewTextFileModalVisible(true); setFabMenuOpen(false); }}>
                <div className="rfm-fab-action">
                  <span className="rfm-fab-action-label">New Text File</span>
                  <div className="rfm-fab-action-icon">
                    <SvgIcon svgType="edit" />
                  </div>
                </div>
              </div>
              <div className="rfm-fab-item" onClick={() => { photoInputRef.current?.click(); setFabMenuOpen(false); }}>
                <div className="rfm-fab-action">
                  <span className="rfm-fab-action-label">Take Photo</span>
                  <div className="rfm-fab-action-icon">
                    <SvgIcon svgType="camera" />
                  </div>
                </div>
              </div>
              <div className="rfm-fab-item" onClick={() => { triggerOpenUpload?.(); setFabMenuOpen(false); }}>
                <div className="rfm-fab-action">
                  <span className="rfm-fab-action-label">Upload Files</span>
                  <div className="rfm-fab-action-icon">
                    <SvgIcon svgType="upload" />
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`rfm-fab sm:hidden transition-transform duration-300 ${fabMenuOpen ? 'rotate-45 bg-rose-500 !shadow-rose-500/30' : ''}`}
              onClick={(e) => { e.stopPropagation(); setFabMenuOpen(!fabMenuOpen); }}
            >
              <SvgIcon svgType="plus" />
            </div>

            {/* Quick Paste Button for Mobile */}
            {clipboardIds.length > 0 && clipboardSourceFolder !== currentFolder && (
              <div
                className="rfm-fab sm:hidden rfm-fab-paste"
                onClick={(e) => { e.stopPropagation(); handlePaste(); }}
                title={`Paste ${clipboardIds.length} items`}
              >
                <div className="relative">
                  <SvgIcon svgType="copy" />
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {clipboardIds.length}
                  </span>
                </div>
              </div>
            )}

            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={photoInputRef}
              className="hidden"
              onChange={async (e) => {
                if (e.target.files && e.target.files.length > 0 && onUpload) {
                  const file = e.target.files[0];
                  if (!file) return;
                  const timestamp = new Date().getTime();
                  const fileName = `photo_${timestamp}.jpg`;
                  const renamedFile = new File([file], fileName, { type: file.type });
                  await onUpload([{ file: renamedFile, path: fileName }], currentFolder);
                }
              }}
            />
          </>
        )
      }

      {/* Contextual Action Bar (Selection Mode) */}
      {
        selectedIds.length > 0 && (
          <div className="rfm-selection-bar">
            <div
              className="rfm-selection-pill"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const allIds = currentFolderFiles.map(f => f.id);
                const isAllSelected = allIds.length > 0 && allIds.every(id => selectedIds.includes(id));

                if (isAllSelected) {
                  setSelectedIds([]);
                } else {
                  setSelectedIds(allIds);
                }
              }}
              title="Toggle Select All"
            >
              <div className={`rfm-selection-checkbox ${currentFolderFiles.length > 0 && currentFolderFiles.every(f => selectedIds.includes(f.id)) ? 'is-checked' : ''}`}>
                <SvgIcon svgType={currentFolderFiles.length > 0 && currentFolderFiles.every(f => selectedIds.includes(f.id)) ? "check" : "square"} />
              </div>
              <div className="rfm-selection-info">
                <span className="rfm-selection-count">{selectedIds.length}</span>
                <span className="rfm-selection-label">Selected</span>
              </div>
            </div>

            <div
              className="rfm-selection-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                setClipboardIds(selectedIds);
                setIsCut(false);
                setClipboardSourceFolder(currentFolder);
                setSelectedIds([]);
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              title="Copy"
            >
              <SvgIcon svgType="copy" />
            </div>

            <div
              className="rfm-selection-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                setClipboardIds(selectedIds);
                setIsCut(true);
                setClipboardSourceFolder(currentFolder);
                setSelectedIds([]);
                if (navigator.vibrate) navigator.vibrate(50);
              }}
              title="Move"
            >
              <SvgIcon svgType="scissors" />
            </div>

            <div
              className="rfm-selection-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const targetFile = selectedIds.length === 1
                  ? (currentFolderFiles.find(f => f.id === selectedIds[0]) || fs.find(f => f.id === selectedIds[0]) || null)
                  : null;

                setContextMenu({
                  x: rect.left,
                  y: rect.top - 8,
                  file: targetFile
                });
              }}
              title="More Actions"
            >
              <SvgIcon svgType="dots" />
            </div>

            <div
              className="rfm-selection-action-btn danger ml-auto"
              onClick={(e) => {
                e.stopPropagation();
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
              }}
              title="Delete"
            >
              <SvgIcon svgType="trash" />
            </div>
          </div>
        )
      }
      {/* Modals */}

      <NewTextFileModal
        isVisible={newTextFileModalVisible}
        onClose={() => setNewTextFileModalVisible(false)}
        onCreate={async (fileName, content) => {
          const file = new File([content], fileName, { type: "text/plain" });
          if (onUpload) {
            await onUpload([{ file, path: fileName }], currentFolder);
          }
        }}
      />

    </section >

  );
};

export default Workspace;
