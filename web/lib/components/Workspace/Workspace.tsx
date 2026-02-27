import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useFileManager } from "../../context";
import type { FileType } from "../../types";
import { ViewStyle } from "../../types";
import { isDescendantOrSelf } from "../../utils/fileUtils";
import { useFileActions } from "../../hooks/useFileActions";
import { useMediaQuery } from "../../hooks/useMediaQuery";

// Components
import FolderPath from "./FolderPath";
import { scanEntries } from "../../utils/upload";

// Modularized Workspace components
import { FileTable } from "./FileTable";
import { FileGrid } from "./FileGrid";
import { getColumns } from "./TableColumns";
import FloatingActionButton from "./FloatingActionButton";
import SelectionBar from "./SelectionBar";

// Hooks
import { useWorkspaceKeyboard } from "../../hooks/useWorkspaceKeyboard";
import { useMarqueeSelection } from "../../hooks/useMarqueeSelection";

// Modals
import NewTextFileModal from "../Modals/NewTextFileModal";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
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
    iconSize,
    favorites,
    toggleFavorite,
  } = useFileManager();

  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const [newTextFileModalVisible, setNewTextFileModalVisible] = useState(false);

  // Breadcrumb visibility state
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollTopRef = React.useRef(0);
  const scrollThreshold = 10;

  const { handlePaste, handleShare } = useFileActions();

  // Marquee selection hook
  const { marquee, handleMouseDown, didDragSelectionRef } = useMarqueeSelection(
    selectedIds,
    setSelectedIds,
  );

  useEffect(() => {
    setLastSelectedId(null);
  }, [currentFolder]);

  useEffect(() => {
    if (highlightedId) {
      setTimeout(() => {
        const element = document.querySelector(`[data-id="${highlightedId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          setSelectedIds([highlightedId]);
        }
        setTimeout(() => {
          if (setHighlightedId) setHighlightedId(null);
        }, 3000);
      }, 100);
    }
  }, [highlightedId, currentFolder, setHighlightedId, setSelectedIds]);

  const handleDragStart = (e: React.DragEvent, file: FileType) => {
    if (file.scanStatus === "pending" || file.scanStatus === "scanning") {
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
        const fsMap = new Map(fs.map((f) => [f.id, f]));
        const invalidMoves = sourceIds.filter((id) =>
          isDescendantOrSelf(fsMap, id, folder.id),
        );
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

  const handleContextMenu = useCallback(
    (
      e: React.MouseEvent | { clientX: number; clientY: number },
      file: FileType | null,
    ) => {
      if ("preventDefault" in e) e.preventDefault();
      if (viewOnly) return;

      if (file) {
        const isAlreadySelected = selectedIds.includes(file.id);

        if (isMobile) {
          if (selectedIds.length === 0) {
            setSelectedIds([file.id]);
            if (navigator.vibrate) navigator.vibrate(50);
          } else if (!isAlreadySelected) {
            setSelectedIds((prev: string[]) => [...prev, file.id]);
            setLastSelectedId(file.id);
            if (navigator.vibrate) navigator.vibrate(50);
          } else {
            setContextMenu({ x: e.clientX, y: e.clientY, file });
          }
          return;
        }

        if (!isAlreadySelected) {
          setSelectedIds([file.id]);
          setLastSelectedId(file.id);
        }
      }

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        file,
      });
    },
    [viewOnly, selectedIds, isMobile, setContextMenu, setSelectedIds],
  );

  const handleDrop = useCallback(
    async (acceptedFiles: File[], _fileRejections: any[], event: any) => {
      if (viewOnly) return;

      const targetFolderId = currentFolder;

      try {
        const droppedItems = (event as any).dataTransfer?.items;
        if (droppedItems) {
          const entries = await scanEntries(droppedItems);
          if (onUpload) await onUpload(entries, targetFolderId);
        } else {
          if (onUpload) {
            const uploadPayload = acceptedFiles.map((f) => ({
              file: f,
              path: (f as any).path || f.name,
            }));
            await onUpload(uploadPayload, targetFolderId);
          }
        }
        if (onRefresh) await onRefresh(targetFolderId);
      } catch (err) {
        console.error("Upload failed:", err);
      }
    },
    [viewOnly, currentFolder, onUpload, onRefresh],
  );

  const { getRootProps, getInputProps, isDragAccept, open } = useDropzone({
    onDrop: handleDrop,
    noClick: true,
    noKeyboard: true,
  });

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

    if (resetUploadToastCountdown) resetUploadToastCountdown();

    if (e.ctrlKey || e.metaKey) {
      if (selectedIds.includes(file.id)) {
        setSelectedIds(selectedIds.filter((id) => id !== file.id));
      } else {
        setSelectedIds([...selectedIds, file.id]);
      }
      setLastSelectedId(file.id);
    } else if (e.shiftKey && lastSelectedId) {
      const allIdsInOrder = currentFolderFiles.map((f) => f.id);
      const startIdx = allIdsInOrder.indexOf(lastSelectedId);
      const endIdx = allIdsInOrder.indexOf(file.id);

      if (startIdx !== -1 && endIdx !== -1) {
        const rangeIds = allIdsInOrder.slice(
          Math.min(startIdx, endIdx),
          Math.max(startIdx, endIdx) + 1,
        );
        setSelectedIds(Array.from(new Set([...selectedIds, ...rangeIds])));
      }
    } else if (isMobile && selectedIds.length > 0) {
      if (selectedIds.includes(file.id)) {
        setSelectedIds(selectedIds.filter((id) => id !== file.id));
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
    if (file.scanStatus === "pending" || file.scanStatus === "scanning") return;
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

  // Keyboard shortcuts
  const { handleKeyDown } = useWorkspaceKeyboard({
    currentFolderFiles,
    selectedIds,
    currentFolder,
    setSelectedIds,
    setContextMenu,
    setDialogState,
    setClipboardIds,
    setIsCut,
    setClipboardSourceFolder,
    onBulkDelete,
    onDelete,
    handlePaste,
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <section
      id="react-file-manager-workspace"
      className={`rfm-workspace ${
        isDragAccept && !viewOnly ? "rfm-workspace-dropzone" : ""
      } ${marquee ? "rfm-selecting" : ""}`}
      {...getRootProps()}
      onContextMenu={(e) => handleContextMenu(e, null)}
      onClick={(e) => {
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

          if (
            window.innerWidth <= 768 &&
            Math.abs(currentScrollTop - lastScrollTopRef.current) >
              scrollThreshold
          ) {
            if (currentScrollTop > lastScrollTopRef.current) {
              if (showHeader) setShowHeader(false);
            } else {
              if (!showHeader) setShowHeader(true);
            }
          } else if (window.innerWidth > 768 && !showHeader) {
            setShowHeader(true);
          }
          lastScrollTopRef.current = currentScrollTop;

          if (
            target.scrollHeight - target.scrollTop <=
            target.clientHeight + 100
          ) {
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
      {!viewOnly && (
        <FloatingActionButton
          fabMenuOpen={fabMenuOpen}
          setFabMenuOpen={setFabMenuOpen}
          onNewFolder={() =>
            setNewFolderModalVisible && setNewFolderModalVisible(true)
          }
          onNewTextFile={() => setNewTextFileModalVisible(true)}
          onTakePhoto={() => photoInputRef.current?.click()}
          onUploadFiles={() => triggerOpenUpload?.()}
          clipboardIds={clipboardIds}
          clipboardSourceFolder={clipboardSourceFolder || ""}
          currentFolder={currentFolder}
          onPaste={handlePaste}
          photoInputRef={photoInputRef}
          onUpload={onUpload}
        />
      )}

      {/* Contextual Action Bar (Selection Mode) */}
      <SelectionBar
        selectedIds={selectedIds}
        currentFolderFiles={currentFolderFiles}
        fs={fs}
        currentFolder={currentFolder}
        setSelectedIds={setSelectedIds}
        setClipboardIds={setClipboardIds}
        setIsCut={setIsCut}
        setClipboardSourceFolder={setClipboardSourceFolder}
        setContextMenu={setContextMenu}
        setDialogState={setDialogState}
        handleShare={handleShare}
      />

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
    </section>
  );
};

export default Workspace;
