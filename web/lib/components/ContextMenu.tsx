import React, { useEffect, useRef } from "react";
import { useFileManager } from "../context";
import { FileType } from "../types";
import SvgIcon from "./SvgIcon";
import { api } from "../../src/api";

interface IContextMenuProps {
    x: number;
    y: number;
    file: FileType | null;
    onClose: () => void;
    onPreview: (file: FileType) => void;
    onViewMetadata: (file: FileType) => void;
    onRename: (file: FileType) => void;
    onNewFolder: () => void;
    onUpload: () => void;
}

const ContextMenu: React.FC<IContextMenuProps> = ({
    x,
    y,
    file,
    onClose,
    onPreview,
    onViewMetadata,
    onRename,
    onNewFolder,
    onUpload,
}) => {
    const {
        onDelete,
        clipboard,
        setClipboard,
        setIsCut,
        isCut,
        onMove,
        currentFolder,
        onRefresh,
    } = useFileManager();
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    const handleOpen = () => {
        if (file) {
            onPreview(file);
        }
        onClose();
    };

    const handleDownload = () => {
        if (file && !file.isDir) {
            const url = api.getFileUrl(file.id);
            const link = document.createElement('a');
            link.href = url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        onClose();
    };

    const handleViewMetadata = () => {
        if (file) {
            onViewMetadata(file);
        }
        onClose();
    };

    const handleRename = () => {
        if (file) {
            onRename(file);
        }
        onClose();
    };

    const handleDelete = async () => {
        if (file && onDelete) {
            if (confirm(`Are you sure you want to delete ${file.name}?`)) {
                await onDelete(file.id);
            }
        }
        onClose();
    };

    const handleCut = () => {
        if (file) {
            setClipboard(file);
            setIsCut(true);
        }
        onClose();
    };

    const handlePaste = async () => {
        if (clipboard && onMove) {
            await onMove(clipboard.id, currentFolder);
            if (isCut) {
                setClipboard(null);
                setIsCut(false);
            }
            if (onRefresh) await onRefresh(currentFolder);
        }
        onClose();
    };

    return (
        <div
            ref={menuRef}
            className="rfm-context-menu"
            style={{ top: y, left: x }}
        >
            {file && (
                <>
                    {!file.isDir && (
                        <div className="rfm-context-menu-item" onClick={handleDownload}>
                            <SvgIcon svgType="download" className="rfm-context-menu-icon" />
                            Download
                        </div>
                    )}
                    <div className="rfm-context-menu-item" onClick={handleViewMetadata}>
                        <SvgIcon svgType="info" className="rfm-context-menu-icon" />
                        View Meta Data
                    </div>
                    <div className="rfm-context-menu-item" onClick={handleRename}>
                        <SvgIcon svgType="edit" className="rfm-context-menu-icon" />
                        Rename
                    </div>
                    <div className="rfm-context-menu-item" onClick={handleOpen}>
                        <SvgIcon svgType="eye" className="rfm-context-menu-icon" />
                        Open (Preview)
                    </div>
                    <div className="rfm-context-menu-item" onClick={handleCut}>
                        <SvgIcon svgType="scissors" className="rfm-context-menu-icon" />
                        Cut
                    </div>
                    <div className="rfm-context-menu-item text-rose-500" onClick={handleDelete}>
                        <SvgIcon svgType="trash" className="rfm-context-menu-icon !fill-rose-500" />
                        Delete
                    </div>
                    {file.isDir && (
                        <>
                            <div className="rfm-border-t my-1 border-slate-100" />
                            <div className="rfm-context-menu-item" onClick={() => { onNewFolder(); onClose(); }}>
                                <SvgIcon svgType="plus" className="rfm-context-menu-icon" />
                                New Folder
                            </div>
                            <div className="rfm-context-menu-item" onClick={() => { onUpload(); onClose(); }}>
                                <SvgIcon svgType="upload" className="rfm-context-menu-icon" />
                                Upload Files
                            </div>
                        </>
                    )}
                </>
            )}
            {!file && (
                <>
                    <div className="rfm-context-menu-item" onClick={() => { onNewFolder(); onClose(); }}>
                        <SvgIcon svgType="plus" className="rfm-context-menu-icon" />
                        New Folder
                    </div>
                    <div className="rfm-context-menu-item" onClick={() => { onUpload(); onClose(); }}>
                        <SvgIcon svgType="upload" className="rfm-context-menu-icon" />
                        Upload Files
                    </div>
                </>
            )}
            {!file && clipboard && (
                <div className="rfm-context-menu-item" onClick={handlePaste}>
                    <SvgIcon svgType="clipboard" className="rfm-context-menu-icon" />
                    Paste
                </div>
            )}
        </div>
    );
};

export default ContextMenu;
