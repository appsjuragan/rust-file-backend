import React, { memo, useEffect, useRef, useState } from "react";
import { Grid, useGridRef } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import type { FileType } from "../../types";
import { SkeletonFileItem } from "./SkeletonFileItem";
import FileIcon from "../Icons/FileIcon";
import SvgIcon from "../Icons/SvgIcon";

interface VirtualFileGridProps {
  currentFolderFiles: FileType[];
  selectedIds: string[];
  dragOverId: string | null;
  highlightedId: string | null;
  isLoading?: boolean;
  handleItemClick: (file: FileType, e: React.MouseEvent) => void;
  handleDoubleClick: (file: FileType) => void;
  handleDragStart: (e: React.DragEvent, file: FileType) => void;
  handleDragOver: (e: React.DragEvent, folder: FileType) => void;
  handleDragLeave: () => void;
  handleDropOnFolder: (e: React.DragEvent, folder: FileType) => void;
  handleContextMenu: (e: React.MouseEvent, file: FileType | null) => void;
}

export const VirtualFileGrid: React.FC<VirtualFileGridProps> = ({
  currentFolderFiles,
  selectedIds,
  dragOverId,
  highlightedId,
  isLoading,
  handleItemClick,
  handleDoubleClick,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDropOnFolder,
  handleContextMenu,
}) => {
  // Refs for long press interactions
  const longPressTimer = useRef<any>(null);
  const [isLongPress, setIsLongPress] = useState(false);

  // Accessibility & Focus State
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const gridRef = useGridRef();
  const containerRef = useRef<HTMLDivElement>(null);
  const columnCountRef = useRef<number>(1); // To store current column count for key nav

  // Reset focused index when folder changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [currentFolderFiles]);

  if (isLoading) {
    return (
      <div className="rfm-icons-grid">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonFileItem key={i} />
        ))}
      </div>
    );
  }

  // Determine min column width based on screen width (matching CSS)
  const getMinColumnWidth = (width: number) => {
    if (width <= 480) return 70;
    if (width <= 768) return 80;
    if (width <= 1024) return 90;
    return 95;
  };

  const GAP = 8; // gap-2 = 0.5rem = 8px
  const ROW_HEIGHT = 120; // min-height 105px + padding/margins

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (currentFolderFiles.length === 0) return;

    let newIndex = focusedIndex;
    const totalItems = currentFolderFiles.length;
    const cols = columnCountRef.current;

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        newIndex = Math.min(totalItems - 1, focusedIndex + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        newIndex = Math.max(0, focusedIndex - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        newIndex = Math.min(totalItems - 1, focusedIndex + cols);
        break;
      case "ArrowUp":
        e.preventDefault();
        newIndex = Math.max(0, focusedIndex - cols);
        break;
      case "Enter":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < totalItems) {
          const file = currentFolderFiles[focusedIndex];
          if (file && file.scanStatus !== "infected") {
            handleDoubleClick(file);
          }
        }
        return;
      case " ": // Space
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < totalItems) {
          const file = currentFolderFiles[focusedIndex];
          // Clean mock event for selection
          if (file) {
            handleItemClick(file, { ctrlKey: true } as any);
          }
        }
        return;
      default:
        return;
    }

    if (newIndex !== focusedIndex && newIndex >= 0) {
      setFocusedIndex(newIndex);

      // Scroll into view
      if (gridRef.current) {
        gridRef.current.scrollToRow({
          index: Math.floor(newIndex / cols),
          align: "smart",
        });
      }
    }
  };

  // Interaction handlers (Passed to Cell via cellProps)
  const handlers = {
    handleItemClick,
    handleDoubleClick,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDropOnFolder,
    handleContextMenu,
    selectedIds,
    dragOverId,
    highlightedId,
    isLongPress,
    setIsLongPress,
    longPressTimer,
    focusedIndex,
    setFocusedIndex,
    containerRef,
  };

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, height: "100%", width: "100%", outline: "none" }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="grid"
      aria-label="File Grid"
      className="rfm-virtual-grid-container"
    >
      {/* @ts-ignore */}
      <AutoSizer
        renderProp={({
          height,
          width,
        }: {
          height: number | undefined;
          width: number | undefined;
        }) => {
          if (height === undefined || width === undefined) return null;

          const minColWidth = getMinColumnWidth(width);

          // Logic to mimic auto-fill
          // We need at least one column
          const columnCount = Math.max(
            1,
            Math.floor((width + GAP) / (minColWidth + GAP))
          );
          const columnWidth = (width - GAP * (columnCount - 1)) / columnCount;

          columnCountRef.current = columnCount;
          const rowCount = Math.ceil(currentFolderFiles.length / columnCount);

          return (
            <Grid
              gridRef={gridRef as any}
              columnCount={columnCount}
              columnWidth={columnWidth + GAP} // Include gap in width, but handle in render
              rowCount={rowCount}
              rowHeight={ROW_HEIGHT + GAP}
              cellComponent={Cell as any}
              cellProps={
                {
                  files: currentFolderFiles,
                  columnCount,
                  handlers,
                } as any
              }
              className="rfm-scrollbar"
              style={{ height, width }}
            />
          );
        }}
      />
    </div>
  );
};

// Cell Props type for v2
interface CustomCellProps {
  files: FileType[];
  columnCount: number;
  handlers: any;
}

// Cell Component
const Cell = memo(
  ({
    columnIndex,
    rowIndex,
    style,
    files,
    columnCount,
    handlers,
    ariaAttributes,
  }: CustomCellProps & {
    ariaAttributes: any;
    columnIndex: number;
    rowIndex: number;
    style: React.CSSProperties;
  }) => {
    const index = rowIndex * columnCount + columnIndex;

    // Check if index is valid
    if (index >= files.length) return null;

    const f = files[index];
    if (!f) return null;

    const {
      handleItemClick,
      handleDoubleClick,
      handleDragStart,
      handleDragOver,
      handleDragLeave,
      handleDropOnFolder,
      handleContextMenu,
      selectedIds,
      dragOverId,
      highlightedId,
      isLongPress,
      setIsLongPress,
      longPressTimer,
      focusedIndex,
      setFocusedIndex,
      containerRef,
    } = handlers;

    const isPending = f.scanStatus === "pending" || f.scanStatus === "scanning";
    const isScanning = f.scanStatus === "scanning";
    const isInfected = f.scanStatus === "infected";
    const isSelected = selectedIds.includes(f.id);
    const isFocused = focusedIndex === index;

    let timeLeft = "soon";
    if (isInfected && f.expiresAt) {
      const diff = new Date(f.expiresAt).getTime() - Date.now();
      const minutes = Math.ceil(diff / 60000);
      if (minutes > 0) timeLeft = `${minutes}min`;
    }

    const startLongPress = (e: React.PointerEvent) => {
      setIsLongPress(false);
      if (isPending) return;

      const { clientX, clientY } = e;

      longPressTimer.current = setTimeout(() => {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
          setIsLongPress(true);
          if (navigator.vibrate) navigator.vibrate(50);

          // Trigger context menu for mobile on long press
          handleContextMenu(
            {
              clientX,
              clientY,
              preventDefault: () => { },
              stopPropagation: () => { },
            } as any,
            f
          );
        } else {
          setIsLongPress(true);
          handleItemClick(f, e as unknown as React.MouseEvent);
          if (navigator.vibrate) navigator.vibrate(50);
        }
      }, 500);
    };

    const endLongPress = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };

    const handleTap = (e: React.MouseEvent) => {
      setFocusedIndex(index); // Update focus on click
      containerRef.current?.focus({ preventScroll: true }); // Keep focus on container

      if (isLongPress) {
        setIsLongPress(false);
        return;
      }

      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        if (selectedIds.length > 0) {
          handleItemClick(f, e);
        } else {
          if (f.scanStatus !== "infected") {
            handleDoubleClick(f);
          }
        }
      } else {
        handleItemClick(f, e);
      }
    };

    // Adjust style to account for gap (subtract margin from width/height or use padding)
    // Here we use internal padding wrapper
    const adjustedStyle = {
      ...style,
      width: Number(style.width) - 8, // Subtract GAP
      height: Number(style.height) - 8,
    };

    return (
      <div style={adjustedStyle} {...ariaAttributes} aria-selected={isSelected}>
        <button
          onClick={handleTap}
          onDoubleClick={() => !isInfected && handleDoubleClick(f)}
          onPointerDown={(e) => startLongPress(e)}
          onPointerUp={endLongPress}
          onPointerLeave={endLongPress}
          data-id={f.id}
          draggable={!isInfected}
          onDragStart={(e) => !isInfected && handleDragStart(e, f)}
          onDragOver={(e) => !isInfected && handleDragOver(e, f)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => !isInfected && handleDropOnFolder(e, f)}
          onContextMenu={(e) => {
            if (isPending) return;
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
              e.preventDefault();
              return;
            }
            e.stopPropagation();
            handleContextMenu(e, f);
          }}
          className={`rfm-file-item h-full w-full 
                    ${isPending ? "rfm-pending" : ""} 
                    ${isInfected ? "rfm-suspicious opacity-60 grayscale" : ""} 
                    ${isSelected ? "rfm-selected" : ""} 
                    ${isFocused
              ? "ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900"
              : ""
            }
                    ${dragOverId === f.id ? "rfm-drag-over" : ""} 
                    ${highlightedId === f.id ? "rfm-highlighted" : ""}`}
          disabled={isPending}
          tabIndex={-1} // Manage focus via container
          aria-label={f.name}
        >
          <FileIcon
            id={f.id}
            name={f.name}
            isDir={f.isDir}
            isFavorite={f.isFavorite}
            hasThumbnail={f.hasThumbnail}
            isEncrypted={f.isEncrypted}
            scanStatus={f.scanStatus as any}
          />
          {isPending && (
            <div className="rfm-scanning-overlay">
              {isScanning && (
                <SvgIcon
                  svgType="cog"
                  className="rfm-spinner-small animate-spin mr-1"
                  style={{ width: "14px", height: "14px" }}
                />
              )}
              {isScanning ? "Checking..." : "AV Pending..."}
            </div>
          )}
          {isInfected && (
            <div className="rfm-suspicious-overlay absolute top-0 left-0 right-0 p-1 flex justify-center">
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#423628] text-[#cfa87d] border border-[#6b563f] shadow-sm">
                <span>! Suspicious: {timeLeft}</span>
              </span>
            </div>
          )}
        </button>
      </div>
    );
  }
);
