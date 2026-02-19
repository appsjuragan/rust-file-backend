import React, { useState } from 'react';
import { flexRender, Table, Row } from '@tanstack/react-table';
import { FileType, IconSize } from "../../types";
import SvgIcon from '../Icons/SvgIcon';
import { useLongPress } from '../../hooks/useLongPress';

interface FileTableProps {
    table: Table<FileType>;
    selectedIds: string[];
    dragOverId: string | null;
    highlightedId: string | null;
    handleDragStart: (e: React.DragEvent, file: FileType) => void;
    handleDragOver: (e: React.DragEvent, folder: FileType) => void;
    handleDragLeave: () => void;
    handleDropOnFolder: (e: React.DragEvent, folder: FileType) => void;
    handleContextMenu: (e: React.MouseEvent | { clientX: number, clientY: number }, file: FileType | null) => void;
    handleItemClick: (file: FileType, e: React.MouseEvent) => void;
    handleDoubleClick: (file: FileType) => void;
    currentFolderFiles: FileType[];
    columnsCount: number;
    iconSize?: IconSize;
}

interface FileTableItemProps {
    row: Row<FileType>;
    isSelected: boolean;
    isDragOver: boolean;
    isHighlighted: boolean;
    handleTap: (f: FileType, e: React.MouseEvent) => void;
    handleDoubleClick: (file: FileType) => void;
    handleDragStart: (e: React.DragEvent, file: FileType) => void;
    handleDragOver: (e: React.DragEvent, folder: FileType) => void;
    handleDragLeave: () => void;
    handleDropOnFolder: (e: React.DragEvent, folder: FileType) => void;
    handleContextMenu: (e: React.MouseEvent | { clientX: number, clientY: number }, file: FileType | null) => void;
}

const FileTableItem = React.memo(({
    row,
    isSelected,
    isDragOver,
    isHighlighted,
    handleTap,
    handleDoubleClick,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDropOnFolder,
    handleContextMenu
}: FileTableItemProps) => {
    const isPending = row.original.scanStatus === 'pending' || row.original.scanStatus === 'scanning';
    const isInfected = row.original.scanStatus === 'infected';

    const longPressProps = useLongPress(
        (e) => {
            let clientX = 0;
            let clientY = 0;
            if ('touches' in e && e.touches.length > 0) {
                clientX = e.touches[0]!.clientX;
                clientY = e.touches[0]!.clientY;
            } else {
                const mouseEvent = e as unknown as React.MouseEvent;
                clientX = mouseEvent.clientX;
                clientY = mouseEvent.clientY;
            }
            handleContextMenu({ clientX, clientY }, row.original);
            if (navigator.vibrate) navigator.vibrate(50);
        },
        (e) => handleTap(row.original, e as React.MouseEvent),
        { delay: 400 }
    );

    return (
        <tr
            {...longPressProps}
            onClick={(e) => e.stopPropagation()}
            data-id={row.original.id}
            draggable={!isInfected}
            onDragStart={(e) => !isInfected && handleDragStart(e, row.original)}
            onDragOver={(e) => !isInfected && handleDragOver(e, row.original)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => !isInfected && handleDropOnFolder(e, row.original)}
            onDoubleClick={() => !isInfected && handleDoubleClick(row.original)}
            className={`rfm-file-item rfm-workspace-list-icon-row ${isPending ? 'rfm-pending' : ''} ${isInfected ? 'rfm-suspicious opacity-60 grayscale' : ''} ${isSelected ? "rfm-selected" : ""} ${isDragOver ? "rfm-drag-over" : ""} ${isHighlighted ? "rfm-highlighted" : ""}`}
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
            {row.getVisibleCells().map((cell: any) => (
                <td className="rfm-workspace-list-align-txt" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
            ))}
        </tr>
    );
});

FileTableItem.displayName = 'FileTableItem';

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
    const isMobile = window.innerWidth <= 768;

    const handleTap = React.useCallback((f: FileType, e: React.MouseEvent) => {
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
    }, [isMobile, selectedIds, handleItemClick, handleDoubleClick]);

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
                {table.getRowModel().rows.map(row => (
                    <FileTableItem
                        key={row.id}
                        row={row}
                        isSelected={selectedIds.includes(row.original.id)}
                        isDragOver={dragOverId === row.original.id}
                        isHighlighted={highlightedId === row.original.id}
                        handleTap={handleTap}
                        handleDoubleClick={handleDoubleClick}
                        handleDragStart={handleDragStart}
                        handleDragOver={handleDragOver}
                        handleDragLeave={handleDragLeave}
                        handleDropOnFolder={handleDropOnFolder}
                        handleContextMenu={handleContextMenu}
                    />
                ))}
                {currentFolderFiles.length === 0 && (
                    <tr>
                        <td colSpan={columnsCount} className="py-10 text-center">
                            <div
                                className="rfm-empty-folder"
                                onContextMenu={(e) => {
                                    const isMobileVisible = window.innerWidth <= 768;
                                    if (isMobileVisible) {
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
