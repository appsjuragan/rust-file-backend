import React from 'react';
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
    return (
        <div className="rfm-icons-grid">
            {currentFolderFiles.map((f: FileType, key: number) => {
                const isPending = f.scanStatus === 'pending' || f.scanStatus === 'scanning';
                const isScanning = f.scanStatus === 'scanning';
                const isSelected = selectedIds.includes(f.id);
                return (
                    <button
                        onClick={(e) => handleItemClick(f, e)}
                        onDoubleClick={() => handleDoubleClick(f)}
                        key={key}
                        data-id={f.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, f)}
                        onDragOver={(e) => handleDragOver(e, f)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDropOnFolder(e, f)}
                        onContextMenu={(e) => {
                            if (isPending) return;
                            e.stopPropagation();
                            handleContextMenu(e, f);
                        }}
                        className={`rfm-file-item ${isPending ? "rfm-pending" : ""} ${isSelected ? "rfm-selected" : ""} ${dragOverId === f.id ? "rfm-drag-over" : ""} ${highlightedId === f.id ? "rfm-highlighted" : ""}`}
                        disabled={isPending}
                    >
                        <FileIcon id={f.id} name={f.name} isDir={f.isDir} />
                        {isPending && (
                            <div className="rfm-scanning-overlay">
                                {isScanning && <SvgIcon svgType="cog" className="rfm-spinner-small animate-spin mr-1" style={{ width: '14px', height: '14px' }} />}
                                {isScanning ? "Antivirus scan..." : "AV Pending..."}
                            </div>
                        )}
                    </button>
                )
            })}
        </div>
    );
};
