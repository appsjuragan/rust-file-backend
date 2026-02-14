import React, { useEffect, useRef } from "react";
import { useFileManager } from "../../context";
import { FileType } from "../../types";
import SvgIcon from "../Icons/SvgIcon";
import { fileService } from "../../../src/services/fileService";

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
        onBulkDelete,
        selectedIds,
        setSelectedIds,
        clipboardIds,
        setClipboardIds,
        setIsCut,
        isCut,
        onMove,
        onBulkMove,
        onBulkCopy,
        currentFolder,
        onRefresh,
        setDialogState,
        clipboardSourceFolder,
        setClipboardSourceFolder,
    } = useFileManager();
    const menuRef = useRef<HTMLDivElement>(null);
    const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    const handleDownload = async () => {
        if (file && !file.isDir) {
            try {
                const res = await fileService.getDownloadTicket(file.id);
                const url = fileService.getDownloadUrl(res.ticket);
                const link = document.createElement('a');
                link.href = url;
                link.download = file.name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (err) {
                console.error("Failed to initiate download:", err);
                alert("Failed to prepare download. Please try again.");
            }
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
        if (file && selectedIds.length > 0) {
            setDialogState({
                isVisible: true,
                title: "Confirm Delete",
                message: `Are you sure you want to delete ${selectedIds.length} item(s)?`,
                type: "confirm",
                onConfirm: async () => {
                    if (onBulkDelete) {
                        await onBulkDelete(selectedIds);
                    } else if (onDelete) {
                        for (const id of selectedIds) {
                            await onDelete(id);
                        }
                    }
                    setSelectedIds([]);
                }
            });
        } else if (file && onDelete) {
            setDialogState({
                isVisible: true,
                title: "Confirm Delete",
                message: `Are you sure you want to delete ${file.name}?`,
                type: "confirm",
                onConfirm: async () => {
                    await onDelete(file.id);
                }
            });
        }
        onClose();
    };

    const handleCopy = () => {
        if (selectedIds.length > 0) {
            setClipboardIds(selectedIds);
            setIsCut(false);
            setClipboardSourceFolder(currentFolder);
        } else if (file) {
            setClipboardIds([file.id]);
            setIsCut(false);
            setClipboardSourceFolder(currentFolder);
        }
        setSelectedIds([]);
        if (navigator.vibrate) navigator.vibrate(50);
        onClose();
    };

    const handleCut = () => {
        if (selectedIds.length > 0) {
            setClipboardIds(selectedIds);
            setIsCut(true);
            setClipboardSourceFolder(currentFolder);
        } else if (file) {
            setClipboardIds([file.id]);
            setIsCut(true);
            setClipboardSourceFolder(currentFolder);
        }
        setSelectedIds([]);
        if (navigator.vibrate) navigator.vibrate(50);
        onClose();
    };

    const handlePaste = async () => {
        if (clipboardIds.length > 0) {
            if (isCut) {
                if (onBulkMove) {
                    await onBulkMove(clipboardIds, currentFolder);
                } else if (onMove) {
                    for (const id of clipboardIds) {
                        await onMove(id, currentFolder);
                    }
                }
            }
            setClipboardIds([]);
            setIsCut(false);
            setClipboardSourceFolder(null);
            if (onRefresh) await onRefresh(currentFolder);
        }
        onClose();
    };


    return (
        <>
            {isMobile && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9400]"
                    onClick={onClose}
                />
            )}
            <div
                ref={menuRef}
                className={`rfm-context-menu ${isMobile ? 'is-mobile' : ''}`}
                style={isMobile ? {} : { top: y, left: x }}
            >
                {isMobile && (
                    <div className="rfm-context-menu-handle-wrapper">
                        <div className="rfm-modal-handle" onClick={onClose} />
                        <div className="rfm-context-menu-header">
                            {selectedIds.length > 1
                                ? `${selectedIds.length} items selected`
                                : (file ? file.name : "Action Menu")}
                        </div>
                    </div>
                )}
                <div className="rfm-context-menu-body">
                    {file && (
                        <>
                            {(() => {
                                const isScanBusy = file.scanStatus === 'pending' || file.scanStatus === 'scanning';
                                return (
                                    <>
                                        {!file.isDir && (
                                            <div
                                                className={`rfm-context-menu-item ${isScanBusy ? 'disabled opacity-50 cursor-not-allowed' : ''}`}
                                                onClick={isScanBusy ? undefined : handleDownload}
                                            >
                                                <SvgIcon svgType="download" className="rfm-context-menu-icon" />
                                                Download {isScanBusy && '(Checking...)'}
                                            </div>
                                        )}
                                        <div className="rfm-context-menu-item" onClick={handleViewMetadata}>
                                            <SvgIcon svgType="info" className="rfm-context-menu-icon" />
                                            View Meta Data
                                        </div>
                                        <div
                                            className={`rfm-context-menu-item ${isScanBusy ? 'disabled opacity-50 cursor-not-allowed' : ''}`}
                                            onClick={isScanBusy ? undefined : handleRename}
                                        >
                                            <SvgIcon svgType="edit" className="rfm-context-menu-icon" />
                                            Rename
                                        </div>
                                        <div
                                            className={`rfm-context-menu-item ${isScanBusy ? 'disabled opacity-50 cursor-not-allowed' : ''}`}
                                            onClick={isScanBusy ? undefined : handleOpen}
                                        >
                                            <SvgIcon svgType="eye" className="rfm-context-menu-icon" />
                                            Open (Preview)
                                        </div>
                                        <div
                                            className={`rfm-context-menu-item ${isScanBusy ? 'disabled opacity-50 cursor-not-allowed' : ''}`}
                                            onClick={isScanBusy ? undefined : handleCopy}
                                        >
                                            <SvgIcon svgType="clipboard" className="rfm-context-menu-icon" />
                                            Copy
                                        </div>
                                        <div
                                            className={`rfm-context-menu-item ${isScanBusy ? 'disabled opacity-50 cursor-not-allowed' : ''}`}
                                            onClick={isScanBusy ? undefined : handleCut}
                                        >
                                            <SvgIcon svgType="scissors" className="rfm-context-menu-icon" />
                                            Cut
                                        </div>
                                        <div
                                            className={`rfm-context-menu-item text-rose-500 ${isScanBusy ? 'disabled opacity-50 cursor-not-allowed' : ''}`}
                                            onClick={isScanBusy ? undefined : handleDelete}
                                        >
                                            <SvgIcon svgType="trash" className="rfm-context-menu-icon !fill-rose-500" />
                                            Delete
                                        </div>
                                    </>
                                );
                            })()}
                            {file.isDir && (
                                <>
                                    <div className="rfm-border-t my-1 border-stone-200 dark:border-slate-800" />
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
                    {clipboardIds.length > 0 && clipboardSourceFolder !== currentFolder && (
                        <div className="rfm-context-menu-item" onClick={handlePaste}>
                            <SvgIcon svgType="clipboard" className="rfm-context-menu-icon" />
                            Paste ({clipboardIds.length} item{clipboardIds.length > 1 ? 's' : ''})
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default ContextMenu;
