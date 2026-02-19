import React, { useState } from 'react';
import { FileType, IconSize } from '../../types';
import FileIcon from '../Icons/FileIcon';
import SvgIcon from '../Icons/SvgIcon';
import { useLongPress } from '../../hooks/useLongPress';

interface FileGridProps {
    currentFolderFiles: FileType[];
    selectedIds: string[];
    dragOverId: string | null;
    highlightedId: string | null;
    handleItemClick: (file: FileType, e: React.MouseEvent) => void;
    handleDoubleClick: (file: FileType) => void;
    handleDragStart: (e: React.DragEvent, file: FileType) => void;
    handleDragOver: (e: React.DragEvent, folder: FileType) => void;
    handleDragLeave: () => void;
    handleDropOnFolder: (e: React.DragEvent, folder: FileType) => void;
    handleContextMenu: (e: React.MouseEvent, file: FileType | null) => void;
    iconSize?: IconSize;
}

interface FileGridItemProps {
    file: FileType;
    isSelected: boolean;
    isDragOver: boolean;
    isHighlighted: boolean;
    iconSize?: IconSize;
    handleTap: (f: FileType, e: React.MouseEvent) => void;
    handleDoubleClick: (file: FileType) => void;
    handleDragStart: (e: React.DragEvent, file: FileType) => void;
    handleDragOver: (e: React.DragEvent, folder: FileType) => void;
    handleDragLeave: () => void;
    handleDropOnFolder: (e: React.DragEvent, folder: FileType) => void;
    handleContextMenu: (e: any, file: FileType | null) => void;
}

const FileGridItem = React.memo(({
    file: f,
    isSelected,
    isDragOver,
    isHighlighted,
    iconSize,
    handleTap,
    handleDoubleClick,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDropOnFolder,
    handleContextMenu
}: FileGridItemProps) => {
    const isPending = f.scanStatus === 'pending' || f.scanStatus === 'scanning';
    const isScanning = f.scanStatus === 'scanning';
    const isInfected = f.scanStatus === 'infected';

    const longPressProps = useLongPress(
        (e) => {
            const touch = (e as any).touches?.[0] || (e as any);
            handleContextMenu({ clientX: touch.clientX, clientY: touch.clientY } as any, f);
        },
        (e) => handleTap(f, e),
        { delay: 400 }
    );

    let timeLeft = 'soon';
    if (isInfected && f.expiresAt) {
        const diff = new Date(f.expiresAt).getTime() - Date.now();
        const minutes = Math.ceil(diff / 60000);
        if (minutes > 0) timeLeft = `${minutes}min`;
    }

    return (
        <button
            {...longPressProps}
            onDoubleClick={() => !isInfected && handleDoubleClick(f)}
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
            className={`rfm-file-item ${isPending ? "rfm-pending" : ""} ${isInfected ? "rfm-suspicious opacity-60 grayscale" : ""} ${isSelected ? "rfm-selected" : ""} ${isDragOver ? "rfm-drag-over" : ""} ${isHighlighted ? "rfm-highlighted" : ""}`}
            disabled={isPending}
        >
            <FileIcon id={f.id} name={f.name} isDir={f.isDir} isFavorite={f.isFavorite} />
            {isPending && (
                <div className="rfm-scanning-overlay">
                    {isScanning && <SvgIcon svgType="cog" className="rfm-spinner-small animate-spin mr-1" style={{ width: '14px', height: '14px' }} />}
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
    );
});

FileGridItem.displayName = 'FileGridItem';

export const FileGrid: React.FC<FileGridProps> = ({
    currentFolderFiles,
    selectedIds,
    dragOverId,
    highlightedId,
    handleItemClick,
    handleDoubleClick,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDropOnFolder,
    handleContextMenu,
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
        <div className={`rfm-icons-grid ${iconSize ? `size-${iconSize}` : ''}`}>
            {currentFolderFiles.map((f: FileType, key: number) => (
                <FileGridItem
                    key={f.id || key}
                    file={f}
                    isSelected={selectedIds.includes(f.id)}
                    isDragOver={dragOverId === f.id}
                    isHighlighted={highlightedId === f.id}
                    iconSize={iconSize}
                    handleTap={handleTap}
                    handleDoubleClick={handleDoubleClick}
                    handleDragStart={handleDragStart}
                    handleDragOver={handleDragOver}
                    handleDragLeave={handleDragLeave}
                    handleDropOnFolder={handleDropOnFolder}
                    handleContextMenu={handleContextMenu}
                />
            ))}
        </div>
    );
};
