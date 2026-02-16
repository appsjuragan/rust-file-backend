import React, { memo, useState, useRef, useEffect } from 'react';
import { Table, flexRender, Row } from "@tanstack/react-table";
import { List, useListRef } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { FileType } from "../../types";
import SvgIcon from '../Icons/SvgIcon';
import { SkeletonTableRow } from './SkeletonTableRow';

interface VirtualFileTableProps {
    table: Table<FileType>;
    selectedIds: string[];
    dragOverId: string | null;
    highlightedId: string | null;
    columnsCount: number;
    isLoading?: boolean;
    handleDragStart: (e: React.DragEvent, file: FileType) => void;
    handleDragOver: (e: React.DragEvent, folder: FileType) => void;
    handleDragLeave: () => void;
    handleDropOnFolder: (e: React.DragEvent, folder: FileType) => void;
    handleContextMenu: (e: React.MouseEvent, file: FileType | null) => void;
    handleItemClick: (file: FileType, e: React.MouseEvent) => void;
    handleDoubleClick: (file: FileType) => void;
    currentFolderFiles: FileType[];
}

export const VirtualFileTable: React.FC<VirtualFileTableProps> = ({
    table,
    selectedIds,
    dragOverId,
    highlightedId,
    isLoading,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDropOnFolder,
    handleContextMenu,
    handleItemClick,
    handleDoubleClick,
    currentFolderFiles,
    columnsCount
}) => {
    // Shared Long Press Logic
    const longPressTimer = useRef<any>(null);
    const [isLongPress, setIsLongPress] = useState(false);

    // Accessibility & Focus State
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const listRef = useListRef();
    const containerRef = useRef<HTMLDivElement>(null);

    // Reset focused index when folder changes
    useEffect(() => {
        setFocusedIndex(-1);
    }, [currentFolderFiles]);

    if (isLoading) {
        return (
            <div className="rfm-table-container">
                <table className="rfm-table w-full">
                    <thead>
                        <tr>
                            {Array.from({ length: columnsCount }).map((_, i) => <th key={i}></th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 12 }).map((_, i) => (
                            <SkeletonTableRow key={i} columnsCount={columnsCount} />
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    const rows = table.getRowModel().rows;
    const ROW_HEIGHT = 48; // Slightly reduced for better mobile density while still fitting 2 lines

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (rows.length === 0) return;

        let newIndex = focusedIndex;
        const totalItems = rows.length;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                newIndex = Math.min(totalItems - 1, focusedIndex + 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                newIndex = Math.max(0, focusedIndex - 1);
                break;
            case 'Enter':
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < totalItems) {
                    const row = rows[focusedIndex];
                    if (row && row.original.scanStatus !== 'infected') {
                        handleDoubleClick(row.original);
                    }
                }
                return;
            case ' ': // Space
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < totalItems) {
                    const row = rows[focusedIndex];
                    if (row) {
                        handleItemClick(row.original, { ctrlKey: true } as any);
                    }
                }
                return;
            default:
                return;
        }

        if (newIndex !== focusedIndex && newIndex >= 0) {
            setFocusedIndex(newIndex);

            // Scroll into view
            if (listRef.current) {
                listRef.current.scrollToRow({ index: newIndex, align: 'smart' });
            }
        }
    };

    const contextData = {
        rows,
        selectedIds,
        dragOverId,
        highlightedId,
        handleDragStart,
        handleDragOver,
        handleDragLeave,
        handleDropOnFolder,
        handleContextMenu,
        handleItemClick,
        handleDoubleClick,
        isLongPress,
        setIsLongPress,
        longPressTimer,
        focusedIndex,
        setFocusedIndex,
        containerRef
    };

    return (
        <div
            ref={containerRef}
            style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', outline: 'none' }}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            role="grid"
            aria-label="File List"
        >
            {/* Rigid Header */}
            <div style={{ display: 'flex', minWidth: '100%' }} className="rfm-workspace-list-th-container border-b border-stone-200 dark:border-gray-700 bg-stone-100 dark:bg-gray-800">
                {table.getHeaderGroups().map(headerGroup => (
                    <div key={headerGroup.id} style={{ display: 'flex', width: '100%' }} role="row">
                        {headerGroup.headers.map(header => (
                            <div
                                key={header.id}
                                className="rfm-workspace-list-th"
                                style={{ width: header.getSize(), display: 'flex', alignItems: 'center' }}
                                onClick={header.column.getToggleSortingHandler()}
                                role="columnheader"
                            >
                                <div className="rfm-workspace-list-th-content">
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                    {header.column.getIsSorted() ? (
                                        header.column.getIsSorted() === 'desc' ?
                                            <SvgIcon svgType="arrow-down" className="rfm-header-sort-icon" /> :
                                            <SvgIcon svgType="arrow-up" className="rfm-header-sort-icon" />
                                    ) : ''}
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            {/* Virtualized Body */}
            <div style={{ flex: 1 }}>
                <AutoSizer
                    renderProp={({ height, width }: { height: number | undefined; width: number | undefined }) => {
                        if (height === undefined || width === undefined) return null;
                        return (
                            <List
                                listRef={listRef as any}
                                rowCount={rows.length}
                                rowHeight={ROW_HEIGHT}
                                rowComponent={RowComponent as any}
                                rowProps={contextData as any}
                                className="rfm-scrollbar"
                                style={{ height, width }}
                            />
                        );
                    }}
                />
            </div>
            {currentFolderFiles.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="rfm-empty-folder">
                        <p>Empty folder</p>
                    </div>
                </div>
            )}
        </div>
    );
};

// Row Props type for v2
interface CustomRowProps {
    rows: Row<FileType>[];
    selectedIds: string[];
    dragOverId: string | null;
    highlightedId: string | null;
    handleDragStart: (e: React.DragEvent, file: FileType) => void;
    handleDragOver: (e: React.DragEvent, folder: FileType) => void;
    handleDragLeave: () => void;
    handleDropOnFolder: (e: React.DragEvent, folder: FileType) => void;
    handleContextMenu: (e: React.MouseEvent, file: FileType | null) => void;
    handleItemClick: (file: FileType, e: React.MouseEvent) => void;
    handleDoubleClick: (file: FileType) => void;
    isLongPress: boolean;
    setIsLongPress: (val: boolean) => void;
    longPressTimer: React.MutableRefObject<any>;
    focusedIndex: number;
    setFocusedIndex: (idx: number) => void;
    containerRef: React.RefObject<HTMLDivElement>;
}

// Row Component
const RowComponent = memo(({ index, style, ariaAttributes, rows, selectedIds, dragOverId, highlightedId, handleDragStart, handleDragOver, handleDragLeave, handleDropOnFolder, handleContextMenu, handleItemClick, handleDoubleClick, isLongPress, setIsLongPress, longPressTimer, focusedIndex, setFocusedIndex, containerRef }: CustomRowProps & {
    ariaAttributes: any;
    index: number;
    style: React.CSSProperties;
}) => {
    const row = rows[index];
    if (!row) return null;

    const file = row.original;

    const isSelected = selectedIds.includes(file.id);
    const isPending = file.scanStatus === 'pending' || file.scanStatus === 'scanning';
    const isInfected = file.scanStatus === 'infected';
    const isFocused = focusedIndex === index;

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
                handleContextMenu({
                    clientX,
                    clientY,
                    preventDefault: () => { },
                    stopPropagation: () => { }
                } as any, file);
            } else {
                // Desktop long press behavior: Multi-select
                setIsLongPress(true);
                // Simulate Ctrl+Click behavior for multi-select
                handleItemClick(file, { ctrlKey: true, stopPropagation: () => { } } as any);
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
        setFocusedIndex(index);
        containerRef.current?.focus({ preventScroll: true });

        if (isLongPress) {
            setIsLongPress(false);
            return;
        }
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            if (selectedIds.length > 0) {
                handleItemClick(file, e);
            } else {
                if (file.scanStatus !== 'infected') {
                    handleDoubleClick(file);
                }
            }
        } else {
            handleItemClick(file, e);
        }
    };

    return (
        <div
            style={style}
            {...ariaAttributes}
            data-id={file.id}
            draggable={!isInfected}
            onDragStart={(e) => !isInfected && handleDragStart(e, file)}
            onDragOver={(e) => !isInfected && handleDragOver(e, file)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => !isInfected && handleDropOnFolder(e, file)}
            onClick={handleTap}
            onDoubleClick={() => !isInfected && handleDoubleClick(file)}
            onPointerDown={startLongPress}
            onPointerUp={endLongPress}
            onPointerLeave={endLongPress}
            onContextMenu={(e) => {
                const isMobile = window.innerWidth <= 768;
                if (isMobile) {
                    e.preventDefault();
                    return;
                }
                e.stopPropagation();
                handleContextMenu(e, file);
            }}
            className={`rfm-file-item rfm-workspace-list-icon-row flex items-center
                ${isPending ? 'rfm-pending' : ''}
                ${isInfected ? 'rfm-suspicious opacity-60 grayscale' : ''}
                ${isSelected ? "rfm-selected" : ""}
                ${isFocused ? "bg-blue-100 dark:bg-blue-900/30" : ""}
                ${dragOverId === file.id ? "rfm-drag-over" : ""}
                ${highlightedId === file.id ? "rfm-highlighted" : ""}`}
            aria-selected={isSelected}
            tabIndex={-1}
        >
            {row.getVisibleCells().map((cell: any) => (
                <div key={cell.id} className="rfm-workspace-list-align-txt" style={{
                    width: cell.column.getSize(),
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'normal',
                    paddingTop: '2px',
                    paddingBottom: '2px',
                }} role="gridcell">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
            ))}
        </div>
    );
});
