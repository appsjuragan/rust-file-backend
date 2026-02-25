import React from "react";
import SvgIcon from "../Icons/SvgIcon";
import type { FileType } from "../../types";

interface SelectionBarProps {
    selectedIds: string[];
    currentFolderFiles: FileType[];
    fs: FileType[];
    favorites: FileType[];
    currentFolder: string;
    setSelectedIds: (ids: string[]) => void;
    setClipboardIds: (ids: string[]) => void;
    setIsCut: (val: boolean) => void;
    setClipboardSourceFolder: (folder: string) => void;
    setContextMenu: (menu: any) => void;
    setDialogState: (state: any) => void;
    onBulkDelete?: (ids: string[]) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
    toggleFavorite?: (files: FileType[]) => void;
    handleShare: (file: FileType) => void;
}

const SelectionBar = ({
    selectedIds,
    currentFolderFiles,
    fs,
    favorites,
    currentFolder,
    setSelectedIds,
    setClipboardIds,
    setIsCut,
    setClipboardSourceFolder,
    setContextMenu,
    setDialogState,
    onBulkDelete,
    onDelete,
    toggleFavorite,
    handleShare,
}: SelectionBarProps) => {
    if (selectedIds.length === 0) return null;

    return (
        <div className="rfm-selection-bar">
            <div
                className="rfm-selection-pill"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const allIds = currentFolderFiles.map((f) => f.id);
                    const isAllSelected =
                        allIds.length > 0 &&
                        allIds.every((id) => selectedIds.includes(id));

                    if (isAllSelected) {
                        setSelectedIds([]);
                    } else {
                        setSelectedIds(allIds);
                    }
                }}
                title="Toggle Select All"
            >
                <div
                    className={`rfm-selection-checkbox ${currentFolderFiles.length > 0 &&
                        currentFolderFiles.every((f) => selectedIds.includes(f.id))
                        ? "is-checked"
                        : ""
                        }`}
                >
                    <SvgIcon
                        svgType={
                            currentFolderFiles.length > 0 &&
                                currentFolderFiles.every((f) => selectedIds.includes(f.id))
                                ? "check"
                                : "square"
                        }
                    />
                </div>
                <div className="rfm-selection-info">
                    <span className="rfm-selection-count">{selectedIds.length}</span>
                    <span className="rfm-selection-label">Selected</span>
                </div>
            </div>

            <div
                className="rfm-selection-action-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    setClipboardIds(selectedIds);
                    setIsCut(false);
                    setClipboardSourceFolder(currentFolder);
                    setSelectedIds([]);
                    if (navigator.vibrate) navigator.vibrate(50);
                }}
                title="Copy"
            >
                <SvgIcon svgType="copy" />
            </div>

            <div
                className="rfm-selection-action-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    setClipboardIds(selectedIds);
                    setIsCut(true);
                    setClipboardSourceFolder(currentFolder);
                    setSelectedIds([]);
                    if (navigator.vibrate) navigator.vibrate(50);
                }}
                title="Move"
            >
                <SvgIcon svgType="scissors" />
            </div>

            <div
                className={`rfm-selection-action-btn ${selectedIds.every((id) => favorites.some((f) => f.id === id))
                    ? "rfm-active-star"
                    : ""
                    }`}
                onClick={(e) => {
                    e.stopPropagation();
                    const filesToToggle = currentFolderFiles.filter((f) =>
                        selectedIds.includes(f.id)
                    );
                    if (toggleFavorite) toggleFavorite(filesToToggle);
                    if (navigator.vibrate) navigator.vibrate(50);
                }}
                title="Toggle Favorite"
            >
                <SvgIcon svgType="star" />
            </div>

            {selectedIds.length === 1 && (
                <div
                    className="rfm-selection-action-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        const file =
                            currentFolderFiles.find((f) => f.id === selectedIds[0]) ||
                            fs.find((f) => f.id === selectedIds[0]);
                        if (file) handleShare(file);
                    }}
                    title="Share"
                >
                    <SvgIcon svgType="share" />
                </div>
            )}

            <div
                className="rfm-selection-action-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const targetFile =
                        selectedIds.length === 1
                            ? currentFolderFiles.find((f) => f.id === selectedIds[0]) ||
                            fs.find((f) => f.id === selectedIds[0]) ||
                            null
                            : null;

                    setContextMenu({
                        x: rect.left,
                        y: rect.top - 8,
                        file: targetFile,
                    });
                }}
                title="More Actions"
            >
                <SvgIcon svgType="dots" />
            </div>

            <div
                className="rfm-selection-action-btn danger ml-auto"
                onClick={(e) => {
                    e.stopPropagation();
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
                        },
                    });
                }}
                title="Delete"
            >
                <SvgIcon svgType="trash" />
            </div>
        </div>
    );
};

export default SelectionBar;
