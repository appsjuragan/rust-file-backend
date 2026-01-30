import React, { useMemo } from "react";
import { useFileManager } from "../context";
import SvgIcon from "./SvgIcon";
import type { FileType } from "../types";
import { isDescendantOrSelf, formatSize } from "../utils/fileUtils";

const FolderTreeItem = ({ folder, level }: { folder: FileType; level: number }) => {
    const { fs, currentFolder, setCurrentFolder, onRefresh, setContextMenu, onBulkMove, onMove, selectedIds, setSelectedIds, setIsMoving } = useFileManager();
    const [isDragOver, setIsDragOver] = React.useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        const canDrop = !selectedIds.some(id => isDescendantOrSelf(fs, id, folder.id));
        if (canDrop) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setIsDragOver(true);
        }
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const data = e.dataTransfer.getData("application/json");
        if (!data) return;

        try {
            const idsToMove = JSON.parse(data);
            const validIds = idsToMove.filter((id: string) => !isDescendantOrSelf(fs, id, folder.id));
            if (validIds.length > 0) {
                setIsMoving(true);
                if (onBulkMove) {
                    await onBulkMove(idsToMove, folder.id);
                } else if (onMove) {
                    for (const id of idsToMove) await onMove(id, folder.id);
                }
                if (onRefresh) await onRefresh(currentFolder);
                setSelectedIds([]);
                setIsMoving(false);
            }
        } catch (err) {
            console.error("Sidebar move failed", err);
            setIsMoving(false);
        }
    };

    const subFolders = useMemo(() => {
        return fs.filter((f: FileType) => f.isDir && f.parentId === folder.id);
    }, [fs, folder.id]);

    const handleFolderClick = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setCurrentFolder(id);
        if (onRefresh) {
            try {
                await onRefresh(id);
            } catch (e) {
                console.error("Error during refresh", e);
            }
        }
    };

    const handleContextMenu = (e: React.MouseEvent, file: FileType) => {
        e.preventDefault();
        e.stopPropagation();
        // Set as current folder when right clicking
        setCurrentFolder(file.id);
        setContextMenu({ x: e.clientX, y: e.clientY, file });
    };

    return (
        <div className="rfm-sidebar-tree-item">
            <div
                className={`rfm-sidebar-item ${currentFolder === folder.id ? "active" : ""} ${isDragOver ? "rfm-drag-over" : ""}`}
                onClick={(e) => handleFolderClick(e, folder.id)}
                onContextMenu={(e) => handleContextMenu(e, folder)}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <SvgIcon svgType="folder" className="rfm-sidebar-icon" />
                <span className="rfm-sidebar-item-text" data-text={folder.name}>{folder.name}</span>
            </div>
            {subFolders.length > 0 && (
                <div className="rfm-sidebar-indent">
                    {subFolders.map((sub) => (
                        <FolderTreeItem key={sub.id} folder={sub} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};

const Sidebar = () => {
    const { fs, currentFolder, setCurrentFolder, onRefresh, setContextMenu, onBulkMove, onMove, selectedIds, setSelectedIds, setIsMoving, userFacts } = useFileManager();
    const [isDragOverRoot, setIsDragOverRoot] = React.useState(false);

    const handleDragOverRoot = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsDragOverRoot(true);
    };

    const handleDragLeaveRoot = () => {
        setIsDragOverRoot(false);
    };

    const handleDropRoot = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOverRoot(false);

        const data = e.dataTransfer.getData("application/json");
        if (!data) return;

        try {
            const idsToMove = JSON.parse(data);
            if (idsToMove.length > 0) {
                setIsMoving(true);
                if (onBulkMove) {
                    await onBulkMove(idsToMove, "0");
                } else if (onMove) {
                    for (const id of idsToMove) await onMove(id, "0");
                }
                if (onRefresh) await onRefresh(currentFolder);
                setSelectedIds([]);
                setIsMoving(false);
            }
        } catch (err) {
            console.error("Sidebar root move failed", err);
            setIsMoving(false);
        }
    };

    const rootFolders = useMemo(() => {
        return fs.filter((f: FileType) => f.isDir && (f.parentId === "0" || !f.parentId || f.parentId === "") && f.id !== "0");
    }, [fs]);

    const handleRootClick = async () => {
        setCurrentFolder("0");
        if (onRefresh) await onRefresh("0");
    };

    return (
        <aside className="rfm-sidebar">
            <div className="rfm-sidebar-list">
                <div
                    className={`rfm-sidebar-item ${currentFolder === "0" ? "active" : ""} ${isDragOverRoot ? "rfm-drag-over" : ""}`}
                    onClick={handleRootClick}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCurrentFolder("0");
                        setContextMenu({ x: e.clientX, y: e.clientY, file: null });
                    }}
                    onDragOver={handleDragOverRoot}
                    onDragLeave={handleDragLeaveRoot}
                    onDrop={handleDropRoot}
                >
                    <SvgIcon svgType="folder" className="rfm-sidebar-icon" />
                    <span className="rfm-sidebar-item-text" data-text="Home">Home</span>
                </div>
                <div className="rfm-sidebar-indent">
                    {rootFolders.map((folder) => (
                        <FolderTreeItem key={folder.id} folder={folder} level={1} />
                    ))}
                </div>
            </div>

            {userFacts && (() => {
                const total = userFacts.image_count + userFacts.video_count + userFacts.audio_count + userFacts.document_count + userFacts.others_count;

                let pieStyle = {};
                if (total > 0) {
                    const imgP = (userFacts.image_count / total) * 100;
                    const vidP = (userFacts.video_count / total) * 100;
                    const audP = (userFacts.audio_count / total) * 100;
                    const docP = (userFacts.document_count / total) * 100;

                    const stops = [
                        `#eab308 0% ${imgP}%`,
                        `#ef4444 ${imgP}% ${imgP + vidP}%`,
                        `#3b82f6 ${imgP + vidP}% ${imgP + vidP + audP}%`,
                        `#22c55e ${imgP + vidP + audP}% ${imgP + vidP + audP + docP}%`,
                        `#64748b ${imgP + vidP + audP + docP}% 100%`
                    ];
                    pieStyle = { background: `conic-gradient(${stops.join(', ')})` };
                } else {
                    pieStyle = { background: '#cbd5e1' };
                }

                return (
                    <div className="rfm-sidebar-facts">
                        <div className="rfm-facts-title">Storage Statistics</div>
                        <div className="rfm-facts-container">
                            <div className="rfm-facts-content">
                                <div className="rfm-fact-item">Files: {userFacts.total_files}</div>
                                <div className="rfm-fact-item">Size: {formatSize(userFacts.total_size)}</div>
                                <div className="rfm-fact-category-list">
                                    <div className="rfm-fact-sub-item"><span className="dot" style={{ backgroundColor: '#eab308' }}></span> Image: {userFacts.image_count}</div>
                                    <div className="rfm-fact-sub-item"><span className="dot" style={{ backgroundColor: '#ef4444' }}></span> Video: {userFacts.video_count}</div>
                                    <div className="rfm-fact-sub-item"><span className="dot" style={{ backgroundColor: '#3b82f6' }}></span> Audio: {userFacts.audio_count}</div>
                                    <div className="rfm-fact-sub-item"><span className="dot" style={{ backgroundColor: '#22c55e' }}></span> Document: {userFacts.document_count}</div>
                                    <div className="rfm-fact-sub-item"><span className="dot" style={{ backgroundColor: '#64748b' }}></span> Others: {userFacts.others_count}</div>
                                </div>
                            </div>
                            <div className="rfm-facts-pie-container">
                                <div className="rfm-facts-pie" style={pieStyle}></div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </aside>
    );
};

export default Sidebar;
