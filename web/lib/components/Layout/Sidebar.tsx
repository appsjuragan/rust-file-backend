import React, { useMemo, useState } from "react";
import { useFileManager } from "../../context";
import SvgIcon from "../Icons/SvgIcon";
import type { FileType } from "../../types";
import { isDescendantOrSelf, formatSize } from "../../utils/fileUtils";

const FolderTreeItem = ({ folder, level }: { folder: FileType; level: number }) => {
    const { fs, currentFolder, setCurrentFolder, onRefresh, setContextMenu, onBulkMove, onMove, selectedIds, setSelectedIds, setIsMoving } = useFileManager();
    const [isDragOver, setIsDragOver] = useState(false);

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

const StorageStats = ({ userFacts }: { userFacts: any }) => {
    const [isStatsMinimized, setIsStatsMinimized] = useState(localStorage.getItem("rfm-stats-minimized") === "true");
    const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

    const toggleMinimize = () => {
        const newValue = !isStatsMinimized;
        setIsStatsMinimized(newValue);
        localStorage.setItem("rfm-stats-minimized", String(newValue));
    };

    const categories = [
        { id: 'image', label: 'Image', value: userFacts.image_count, color: '#eab308' },
        { id: 'video', label: 'Video', value: userFacts.video_count, color: '#ef4444' },
        { id: 'audio', label: 'Audio', value: userFacts.audio_count, color: '#3b82f6' },
        { id: 'document', label: 'Document', value: userFacts.document_count, color: '#22c55e' },
        { id: 'others', label: 'Others', value: userFacts.others_count, color: '#64748b' },
    ];

    const total = categories.reduce((sum, cat) => sum + cat.value, 0);

    const renderPie = () => {
        if (total === 0) return <div className="rfm-facts-pie-empty"></div>;

        const activeCategories = categories.filter(c => c.value > 0);
        const radius = 42; // Reduced radius to prevent clipping

        // If only one category, render a circle for better visual and avoid path bugs
        if (activeCategories.length === 1) {
            const cat = activeCategories[0]!;
            return (
                <svg viewBox="0 0 100 100" className="rfm-facts-pie-svg">
                    <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill={cat.color}
                        className={`rfm-pie-segment ${hoveredCategory === cat.id ? 'active' : ''}`}
                        onMouseEnter={() => setHoveredCategory(cat.id)}
                        onMouseLeave={() => setHoveredCategory(null)}
                    />
                    {hoveredCategory === cat.id && (
                        <g className="rfm-pie-text-group">
                            <text x="50" y="48" textAnchor="middle" className="rfm-pie-percentage">100%</text>
                            <text x="50" y="65" textAnchor="middle" className="rfm-pie-label">of {cat.label}s</text>
                        </g>
                    )}
                </svg>
            );
        }

        let currentAngle = -90;
        return (
            <svg viewBox="0 0 100 100" className="rfm-facts-pie-svg">
                {categories.map(cat => {
                    if (cat.value === 0) return null;
                    const angle = (cat.value / total) * 360;
                    const startAngle = currentAngle;
                    const endAngle = currentAngle + angle;
                    currentAngle += angle;

                    const x1 = 50 + radius * Math.cos((Math.PI * startAngle) / 180);
                    const y1 = 50 + radius * Math.sin((Math.PI * startAngle) / 180);
                    const x2 = 50 + radius * Math.cos((Math.PI * endAngle) / 180);
                    const y2 = 50 + radius * Math.sin((Math.PI * endAngle) / 180);

                    const largeArcFlag = angle > 180 ? 1 : 0;
                    const pathData = `M 50 50 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

                    return (
                        <path
                            key={cat.id}
                            d={pathData}
                            fill={cat.color}
                            className={`rfm-pie-segment ${hoveredCategory === cat.id ? 'active' : ''}`}
                            onMouseEnter={() => setHoveredCategory(cat.id)}
                            onMouseLeave={() => setHoveredCategory(null)}
                        />
                    );
                })}
                {hoveredCategory && (() => {
                    const cat = categories.find(c => c.id === hoveredCategory);
                    if (!cat) return null;
                    const percentage = Math.round((cat.value / total) * 100);
                    return (
                        <g className="rfm-pie-text-group">
                            <text x="50" y="48" textAnchor="middle" className="rfm-pie-percentage">{percentage}%</text>
                            <text x="50" y="65" textAnchor="middle" className="rfm-pie-label">of {cat.label}s</text>
                        </g>
                    );
                })()}
            </svg>
        );
    };

    return (
        <div className={`rfm-sidebar-facts ${isStatsMinimized ? 'minimized' : ''}`}>
            <div className="rfm-facts-header" onClick={toggleMinimize}>
                <div className="rfm-facts-title">Storage usage</div>
                <div className="rfm-facts-toggle-btn">
                    <SvgIcon svgType={isStatsMinimized ? "arrow-up" : "arrow-down"} className="w-2.5 h-2.5" />
                </div>
            </div>
            {isStatsMinimized ? (
                <div className="rfm-facts-minimized-info" onClick={toggleMinimize}>
                    {userFacts.total_files} files / {formatSize(userFacts.total_size)}
                </div>
            ) : (
                <div className="rfm-facts-container">
                    <div className="rfm-facts-content">
                        <div className="rfm-fact-item">Files: {userFacts.total_files}</div>
                        <div className="rfm-fact-item">Size: {formatSize(userFacts.total_size)}</div>
                        <div className="rfm-fact-category-list">
                            {categories.map(cat => (
                                <div
                                    key={cat.id}
                                    className={`rfm-fact-sub-item ${hoveredCategory === cat.id ? 'highlighted' : ''}`}
                                    onMouseEnter={() => setHoveredCategory(cat.id)}
                                    onMouseLeave={() => setHoveredCategory(null)}
                                >
                                    <span className="dot" style={{ backgroundColor: cat.color }}></span>
                                    {cat.label}: {cat.value}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="rfm-facts-pie-container">
                        {renderPie()}
                    </div>
                </div>
            )}
        </div>
    );
};

const Sidebar = () => {
    const { fs, currentFolder, setCurrentFolder, onRefresh, setContextMenu, onBulkMove, onMove, selectedIds, setSelectedIds, setIsMoving, userFacts } = useFileManager();
    const [isDragOverRoot, setIsDragOverRoot] = useState(false);

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
                    <SvgIcon svgType="home" className="rfm-sidebar-icon" />
                    <span className="rfm-sidebar-item-text" data-text="Home">Home</span>
                </div>
                <div className="rfm-sidebar-indent">
                    {rootFolders.map((folder) => (
                        <FolderTreeItem key={folder.id} folder={folder} level={1} />
                    ))}
                </div>
            </div>

            {userFacts && <StorageStats userFacts={userFacts} />}
        </aside>
    );
};

export default Sidebar;
