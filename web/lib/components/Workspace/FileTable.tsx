import React, { useState } from 'react';
import { flexRender, Table } from '@tanstack/react-table';
import { FileType, IconSize } from "../../types";
import SvgIcon from '../Icons/SvgIcon';

interface FileTableProps {
    table: Table<FileType>;
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
    currentFolderFiles: FileType[];
    columnsCount: number;
    iconSize?: IconSize;
}

export const FileTable: React.FC<FileTableProps> = ({
    table,
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
    currentFolderFiles,
    columnsCount,
    iconSize
}) => {
    const longPressTimer = React.useRef<any>(null);
    const [isLongPress, setIsLongPress] = useState(false);

    const startLongPress = (f: FileType, e: React.PointerEvent) => {
        setIsLongPress(false);
        if (f.scanStatus === 'pending' || f.scanStatus === 'scanning') return;

        longPressTimer.current = setTimeout(() => {
            setIsLongPress(true);
            handleItemClick(f, e as unknown as React.MouseEvent);
            try {
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            } catch (err) {
                // Ignore vibration errors as they are non-critical interventions
                console.debug("Vibration blocked or not supported:", err);
            }
        }, 400);
    };

    const endLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleTap = (f: FileType, e: React.MouseEvent) => {
        if (isLongPress) {
            setIsLongPress(false);
            return;
        }

        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            if (selectedIds.length > 0) {
                handleItemClick(f, e);
            } else {
                if (f.scanStatus !== 'infected') {
                    handleDoubleClick(f);
                }
            }
        } else {
            handleItemClick(f, e);
        }
    };

    return (
        <table className={`w-full rfm-file-table ${iconSize ? `size-${iconSize}` : ''}`}>
            <thead>
                {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                            <th className="rfm-workspace-list-th" key={header.id} onClick={header.column.getToggleSortingHandler()}>
                                <div className="rfm-workspace-list-th-content">
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                    {header.column.getIsSorted() ? (
                                        header.column.getIsSorted() === 'desc' ?
                                            <SvgIcon svgType="arrow-down" className="rfm-header-sort-icon" /> :
                                            <SvgIcon svgType="arrow-up" className="rfm-header-sort-icon" />
                                    ) : ''}
                                </div>
                            </th>
                        ))}
                    </tr>
                ))}
            </thead>
            <tbody>
                {table.getRowModel().rows.map(row => {
                    const isSelected = selectedIds.includes(row.original.id);
                    const isPending = row.original.scanStatus === 'pending' || row.original.scanStatus === 'scanning';
                    const isInfected = row.original.scanStatus === 'infected';
                    return (
                        <tr
                            key={row.id}
                            data-id={row.original.id}
                            draggable={!isInfected}
                            onDragStart={(e) => !isInfected && handleDragStart(e, row.original)}
                            onDragOver={(e) => !isInfected && handleDragOver(e, row.original)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => !isInfected && handleDropOnFolder(e, row.original)}
                            onClick={(e) => handleTap(row.original, e)}
                            onDoubleClick={() => !isInfected && handleDoubleClick(row.original)}
                            onPointerDown={(e) => startLongPress(row.original, e)}
                            onPointerUp={endLongPress}
                            onPointerLeave={endLongPress}
                            className={`rfm-file-item rfm-workspace-list-icon-row ${isPending ? 'rfm-pending' : ''} ${isInfected ? 'rfm-suspicious opacity-60 grayscale' : ''} ${isSelected ? "rfm-selected" : ""} ${dragOverId === row.original.id ? "rfm-drag-over" : ""} ${highlightedId === row.original.id ? "rfm-highlighted" : ""}`}
                            onContextMenu={(e) => {
                                const isMobile = window.innerWidth <= 768;
                                if (isMobile) {
                                    e.preventDefault();
                                    return;
                                }
                                e.stopPropagation();
                                handleContextMenu(e, row.original);
                            }}
                        >
                            {row.getVisibleCells().map(cell => (
                                <td className="rfm-workspace-list-align-txt" key={cell.id}>
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    );
                })}
                {currentFolderFiles.length === 0 && (
                    <tr>
                        <td colSpan={columnsCount} className="py-10 text-center">
                            <div
                                className="rfm-empty-folder"
                                onContextMenu={(e) => {
                                    const isMobile = window.innerWidth <= 768;
                                    if (isMobile) {
                                        e.preventDefault();
                                        return;
                                    }
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
    );
};
