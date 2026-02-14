import React, { useState } from 'react';
import { FileType } from '../../types';
import FileIcon from '../Icons/FileIcon';
import SvgIcon from '../Icons/SvgIcon';

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
}

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
    handleContextMenu
}) => {
    const longPressTimer = React.useRef<any>(null);
    const [isLongPress, setIsLongPress] = useState(false);

    const startLongPress = (f: FileType, e: React.PointerEvent) => {
        setIsLongPress(false);
        if (f.scanStatus === 'pending' || f.scanStatus === 'scanning') return;

        longPressTimer.current = setTimeout(() => {
            setIsLongPress(true);
            handleItemClick(f, e as unknown as React.MouseEvent);
            if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
    };

    const endLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleTap = (f: FileType, e: React.MouseEvent) => {
        // If we just finished a long press, don't trigger a normal click
        if (isLongPress) {
            setIsLongPress(false);
            return;
        }

        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            if (selectedIds.length > 0) {
                // In selection mode: toggle selection
                handleItemClick(f, e);
            } else {
                // Not in selection mode: open immediately
                if (f.scanStatus !== 'infected') {
                    handleDoubleClick(f);
                }
            }
        } else {
            // Desktop: default selection behavior
            handleItemClick(f, e);
        }
    };

    return (
        <div className="rfm-icons-grid">
            {currentFolderFiles.map((f: FileType, key: number) => {
                const isPending = f.scanStatus === 'pending' || f.scanStatus === 'scanning';
                const isScanning = f.scanStatus === 'scanning';
                const isInfected = f.scanStatus === 'infected';
                const isSelected = selectedIds.includes(f.id);

                let timeLeft = 'soon';
                if (isInfected && f.expiresAt) {
                    const diff = new Date(f.expiresAt).getTime() - Date.now();
                    const minutes = Math.ceil(diff / 60000);
                    if (minutes > 0) timeLeft = `${minutes}min`;
                }

                return (
                    <button
                        onClick={(e) => handleTap(f, e)}
                        onDoubleClick={() => !isInfected && handleDoubleClick(f)}
                        onPointerDown={(e) => startLongPress(f, e)}
                        onPointerUp={endLongPress}
                        onPointerLeave={endLongPress}
                        key={key}
                        data-id={f.id}
                        draggable={!isInfected}
                        onDragStart={(e) => !isInfected && handleDragStart(e, f)}
                        onDragOver={(e) => !isInfected && handleDragOver(e, f)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => !isInfected && handleDropOnFolder(e, f)}
                        onContextMenu={(e) => {
                            if (isPending) return;
                            e.stopPropagation();
                            handleContextMenu(e, f);
                        }}
                        className={`rfm-file-item ${isPending ? "rfm-pending" : ""} ${isInfected ? "rfm-suspicious opacity-60 grayscale" : ""} ${isSelected ? "rfm-selected" : ""} ${dragOverId === f.id ? "rfm-drag-over" : ""} ${highlightedId === f.id ? "rfm-highlighted" : ""}`}
                        disabled={isPending}
                    >
                        <FileIcon id={f.id} name={f.name} isDir={f.isDir} />
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
                )
            })}
        </div>
    );
};
