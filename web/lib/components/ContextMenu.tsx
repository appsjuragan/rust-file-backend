import React, { useEffect, useRef } from "react";
import { useFileManager } from "../context";
import { FileType } from "../types";

interface IContextMenuProps {
    x: number;
    y: number;
    file: FileType | null;
    onClose: () => void;
    onPreview: (file: FileType) => void;
}

const ContextMenu: React.FC<IContextMenuProps> = ({
    x,
    y,
    file,
    onClose,
    onPreview,
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
                    <div className="rfm-context-menu-item" onClick={handleOpen}>
                        Open (Preview)
                    </div>
                    <div className="rfm-context-menu-item" onClick={handleCut}>
                        Cut
                    </div>
                    <div className="rfm-context-menu-item text-rose-500" onClick={handleDelete}>
                        Delete
                    </div>
                </>
            )}
            {!file && clipboard && (
                <div className="rfm-context-menu-item" onClick={handlePaste}>
                    Paste
                </div>
            )}
            {!file && !clipboard && (
                <div className="rfm-context-menu-item disabled">
                    No actions available
                </div>
            )}
        </div>
    );
};

export default ContextMenu;
