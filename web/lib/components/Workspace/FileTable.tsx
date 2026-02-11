import React, { useState } from 'react';
import { flexRender, Table } from '@tanstack/react-table';
import { FileType } from "../../types";
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
    columnsCount
}) => {
    const [lastTap, setLastTap] = useState<{ time: number, id: string | null } | null>(null);

    return (
        <table className="w-full">
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
                            onClick={(e) => handleItemClick(row.original, e)}
                            onDoubleClick={() => !isInfected && handleDoubleClick(row.original)}
                            onTouchEnd={() => {
                                const now = Date.now();
                                if (lastTap && lastTap.id === row.original.id && now - lastTap.time < 300) {
                                    if (!isInfected) {
                                        handleDoubleClick(row.original);
                                    }
                                    setLastTap(null); // Reset after double tap
                                } else {
                                    setLastTap({ time: now, id: row.original.id });
                                }
                            }}
                            className={`rfm-file-item rfm-workspace-list-icon-row ${isPending ? 'rfm-pending' : ''} ${isInfected ? 'rfm-suspicious opacity-60 grayscale' : ''} ${isSelected ? "rfm-selected" : ""} ${dragOverId === row.original.id ? "rfm-drag-over" : ""} ${highlightedId === row.original.id ? "rfm-highlighted" : ""}`}
                            onContextMenu={(e) => {
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
