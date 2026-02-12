import React, { useMemo, useState, useCallback } from "react";
import { useFileManager } from "../../context";
import SvgIcon from "../Icons/SvgIcon";
import type { FileType, FolderNode } from "../../types";
import { isDescendantOrSelf, formatSize } from "../../utils/fileUtils";

// Build a map of parentId -> children for O(1) child lookups
const buildChildrenMap = (tree: FolderNode[]): Map<string, FolderNode[]> => {
    const map = new Map<string, FolderNode[]>();
    for (const node of tree) {
        const key = node.parent_id ?? "0";
        const list = map.get(key);
        if (list) {
            list.push(node);
        } else {
            map.set(key, [node]);
        }
    }
    return map;
};


// Helper: convert FolderNode to a FileType-like object for drag-drop / context menu
const nodeToFileType = (node: FolderNode): FileType => ({
    id: node.id,
    name: node.filename,
    isDir: true,
    parentId: node.parent_id ?? "0",
});

interface FolderTreeItemProps {
    node: FolderNode;
    childrenMap: Map<string, FolderNode[]>;
    level: number;
    expandedIds: Set<string>;
    onToggle: (id: string) => void;
}

const FolderTreeItem = React.memo(({ node, childrenMap, level, expandedIds, onToggle }: FolderTreeItemProps) => {
    const { fs, currentFolder, setCurrentFolder, onRefresh, setContextMenu, onBulkMove, onMove, selectedIds, setSelectedIds, setIsMoving } = useFileManager();
    const [isDragOver, setIsDragOver] = useState(false);

    const children = childrenMap.get(node.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    const handleDragOver = (e: React.DragEvent) => {
        const canDrop = !selectedIds.some(id => isDescendantOrSelf(fs, id, node.id));
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
            const validIds = idsToMove.filter((id: string) => !isDescendantOrSelf(fs, id, node.id));
            if (validIds.length > 0) {
                setIsMoving(true);
                if (onBulkMove) {
                    await onBulkMove(idsToMove, node.id);
                } else if (onMove) {
                    for (const id of idsToMove) await onMove(id, node.id);
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

    const handleFolderClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentFolder(node.id);
        // Auto-expand when clicking
        if (hasChildren && !isExpanded) {
            onToggle(node.id);
        }
        if (onRefresh) {
            try {
                await onRefresh(node.id);
            } catch (e) {
                console.error("Error during refresh", e);
            }
        }
    };

    const handleToggleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle(node.id);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setCurrentFolder(node.id);
        setContextMenu({ x: e.clientX, y: e.clientY, file: nodeToFileType(node) });
    };

    return (
        <div className="rfm-sidebar-tree-item">
            <div
                className={`rfm-sidebar-item ${currentFolder === node.id ? "active" : ""} ${isDragOver ? "rfm-drag-over" : ""}`}
                onClick={handleFolderClick}
                onContextMenu={handleContextMenu}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {hasChildren ? (
                    <span className="rfm-sidebar-chevron" onClick={handleToggleClick}>
                        <SvgIcon svgType={isExpanded ? "arrow-down" : "arrow-right"} className="rfm-chevron-icon" />
                    </span>
                ) : (
                    <span className="rfm-sidebar-chevron rfm-chevron-spacer" />
                )}
                <SvgIcon svgType="folder" className="rfm-sidebar-icon" />
                <span className="rfm-sidebar-item-text" data-text={node.filename}>{node.filename}</span>
            </div>
            {hasChildren && isExpanded && (
                <div className="rfm-sidebar-indent">
                    {children.map((child) => (
                        <FolderTreeItem
                            key={child.id}
                            node={child}
                            childrenMap={childrenMap}
                            level={level + 1}
                            expandedIds={expandedIds}
                            onToggle={onToggle}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});
FolderTreeItem.displayName = "FolderTreeItem";

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
                            <text x="50" y="65" textAnchor="middle" className="rfm-pie-label">of {cat.label === "Others" ? cat.label : `${cat.label}s`}</text>
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
                            <text x="50" y="65" textAnchor="middle" className="rfm-pie-label">of {cat.label === "Others" ? cat.label : `${cat.label}s`}</text>
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
    const { currentFolder, setCurrentFolder, onRefresh, setContextMenu, onBulkMove, onMove, selectedIds, setSelectedIds, setIsMoving, userFacts, folderTree } = useFileManager();
    const [isDragOverRoot, setIsDragOverRoot] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set<string>());

    // Build the children lookup map from the dedicated folder tree
    const childrenMap = useMemo(() => buildChildrenMap(folderTree), [folderTree]);

    // Build id -> node map for quick ancestor lookup
    const idToNodeMap = useMemo(() => {
        const map = new Map<string, FolderNode>();
        for (const node of folderTree) map.set(node.id, node);
        return map;
    }, [folderTree]);

    // Root folders = those with no parent (parent_id is null or "0")
    const rootFolders = useMemo(() => {
        return childrenMap.get("0") ?? [];
    }, [childrenMap]);

    // Auto-expand ancestors of current folder so the active item is always visible
    useMemo(() => {
        if (currentFolder && currentFolder !== "0") {
            const ancestors = new Set<string>();
            let current = idToNodeMap.get(currentFolder);
            while (current) {
                const parentKey = current.parent_id ?? "0";
                if (parentKey === "0" || ancestors.has(parentKey)) break;
                ancestors.add(parentKey);
                current = idToNodeMap.get(parentKey);
            }

            if (ancestors.size > 0) {
                setExpandedIds(prev => {
                    const next = new Set(prev);
                    let changed = false;
                    for (const id of ancestors) {
                        if (!next.has(id)) {
                            next.add(id);
                            changed = true;
                        }
                    }
                    return changed ? next : prev;
                });
            }
        }
    }, [currentFolder, idToNodeMap]);

    const handleToggle = useCallback((id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

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
                    {rootFolders.map((node) => (
                        <FolderTreeItem
                            key={node.id}
                            node={node}
                            childrenMap={childrenMap}
                            level={1}
                            expandedIds={expandedIds}
                            onToggle={handleToggle}
                        />
                    ))}
                </div>
            </div>

            {userFacts && <StorageStats userFacts={userFacts} />}
        </aside>
    );
};

export default Sidebar;
