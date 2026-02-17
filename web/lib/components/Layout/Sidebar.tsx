import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
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

const FavoriteItem = ({ fav, onRemove, onSelect }: { fav: FileType, onRemove: () => void, onSelect: (f: FileType) => void }) => {
    const [swipeX, setSwipeX] = useState(0);
    const [touchStartX, setTouchStartX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!e.touches[0]) return;
        setTouchStartX(e.touches[0].clientX);
        setIsSwiping(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isSwiping || !e.touches[0]) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - touchStartX;
        // Only allow swiping left
        if (diff < 0) {
            setSwipeX(Math.max(diff, -70)); // Limit swipe to 70px
        } else {
            setSwipeX(0);
        }
    };

    const handleTouchEnd = () => {
        setIsSwiping(false);
        if (swipeX < -40) {
            setSwipeX(-70);
        } else {
            setSwipeX(0);
        }
    };

    return (
        <div className="rfm-swipe-item-container">
            <div
                className="rfm-swipe-action-bg"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
            >
                <SvgIcon svgType="trash" size={20} className="text-white" />
            </div>
            <div
                className="rfm-fact-sub-item rfm-swipable-item cursor-pointer hover:bg-stone-200 dark:hover:bg-slate-800"
                style={{
                    transform: `translateX(${swipeX}px)`,
                    transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                onClick={() => {
                    if (swipeX === 0) onSelect(fav);
                    else setSwipeX(0);
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <SvgIcon svgType={fav.isDir ? "folder" : "file"} size={16} className="mr-2 opacity-70" />
                <span className="flex-1 truncate">{fav.name}</span>
            </div>
        </div>
    );
};

const FolderTreeItem = React.memo(({ node, childrenMap, level, expandedIds, onToggle }: FolderTreeItemProps) => {
    const { fs, currentFolder, setCurrentFolder, onRefresh, setContextMenu, onBulkMove, onMove, selectedIds, setSelectedIds, setIsMoving, setSidebarVisible } = useFileManager();
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

        // Close sidebar on mobile after navigation
        if (window.innerWidth <= 768 && setSidebarVisible) {
            setSidebarVisible(false);
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

    return (
        <div className="rfm-folder-branch">
            <div
                className={`rfm-sidebar-item ${currentFolder === node.id ? "active" : ""} ${isDragOver ? "rfm-drag-over" : ""}`}
                style={{ paddingLeft: `${Math.max(0.5, level * 0.75)}rem` }}
                onClick={handleFolderClick}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentFolder(node.id);
                    setContextMenu({ x: e.clientX, y: e.clientY, file: nodeToFileType(node) });
                }}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData("application/json", JSON.stringify([node.id]));
                    e.dataTransfer.effectAllowed = "move";
                }}
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

            {isExpanded && children.length > 0 && (
                <div className="rfm-sidebar-subfolders">
                    {children.map(child => (
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

const Sidebar = () => {
    const {
        currentFolder,
        setCurrentFolder,
        onRefresh,
        setContextMenu,
        onBulkMove,
        onMove,
        setSelectedIds,
        setIsMoving,
        userFacts,
        folderTree,
        sidebarVisible,
        setSidebarVisible,
        favorites,
        setHighlightedId,
        favoritesMinimized,
        setFavoritesMinimized,
        storageUsageMinimized: factsMinimized, // Aliasing for clarity in this file if desired, or just replace usage
        setStorageUsageMinimized: setFactsMinimized,
        toggleFavorite
    } = useFileManager();
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
    useEffect(() => {
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
        if (window.innerWidth <= 768 && setSidebarVisible) {
            setSidebarVisible(false);
        }
        if (onRefresh) await onRefresh("0");
    };

    // Calculate facts for storage stats
    const totalStorage = 5 * 1024 * 1024 * 1024; // 5GB baseline
    const usedStorage = userFacts?.total_size || 0;
    const storagePercentage = Math.min(100, Math.round((usedStorage / totalStorage) * 100));

    // Manual mapping of categories from the flat metrics in the backend
    const sortedCategories = useMemo(() => {
        if (!userFacts) return [];
        return [
            { cat: 'Images', count: userFacts.image_count, label: 'images' },
            { cat: 'Videos', count: userFacts.video_count, label: 'videos' },
            { cat: 'Docs', count: userFacts.document_count, label: 'documents' },
            { cat: 'Audio', count: userFacts.audio_count, label: 'audio' },
            { cat: 'Other', count: userFacts.others_count, label: 'others' },
        ].filter(c => c.count > 0).sort((a, b) => b.count - a.count);
    }, [userFacts]);

    return (
        <aside className={`rfm-sidebar ${!sidebarVisible ? "is-hidden" : ""}`}>
            <div className="rfm-sidebar-header">
                <div className="rfm-app-logo">
                    <SvgIcon svgType="rocket" className="rfm-app-logo-icon" />
                </div>
                <div className="rfm-app-title">
                    <span className="rfm-app-title-main">Juragan <span className="rfm-app-title-sub">Cloud</span></span>

                </div>
            </div>
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

            {/* Favorites Accordion */}
            {favorites.length > 0 && (
                <div className={`rfm-sidebar-facts ${favoritesMinimized ? 'minimized' : ''}`}>
                    <div className="rfm-facts-header" onClick={() => setFavoritesMinimized(!favoritesMinimized)}>
                        <div className="rfm-facts-title font-bold text-[10px] opacity-80 uppercase tracking-wider">
                            <SvgIcon svgType="star" size={14} className="mr-1.5 opacity-70" />
                            Favorites
                        </div>
                        <button type="button" className="rfm-facts-toggle-btn" onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFavoritesMinimized(!favoritesMinimized);
                        }}>
                            <SvgIcon svgType={favoritesMinimized ? "plus" : "minus"} size={12} />
                        </button>
                    </div>

                    {!favoritesMinimized && (
                        <div className="rfm-facts-container">
                            <div className="rfm-facts-content">
                                <div className="rfm-sidebar-favorites-scroll">
                                    <div className="rfm-fact-category-list">
                                        {favorites.map((fav) => (
                                            <FavoriteItem
                                                key={fav.id}
                                                fav={fav}
                                                onRemove={() => toggleFavorite(fav)}
                                                onSelect={(item) => {
                                                    if (item.isDir) {
                                                        setCurrentFolder(item.id);
                                                        if (window.innerWidth <= 768 && setSidebarVisible) {
                                                            setSidebarVisible(false);
                                                        }
                                                    } else {
                                                        if (item.parentId) {
                                                            setCurrentFolder(item.parentId);
                                                            setTimeout(() => {
                                                                if (setHighlightedId) {
                                                                    setHighlightedId(item.id);
                                                                }
                                                            }, 100);
                                                            if (window.innerWidth <= 768 && setSidebarVisible) {
                                                                setSidebarVisible(false);
                                                            }
                                                        }
                                                    }
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Storage Statistics */}
            {userFacts && (
                <div className={`rfm-sidebar-facts ${factsMinimized ? 'minimized' : ''}`}>
                    <div className="rfm-facts-header" onClick={() => setFactsMinimized(!factsMinimized)}>
                        <div className="rfm-facts-title font-bold text-[10px] opacity-80 uppercase tracking-wider">
                            <SvgIcon svgType="info" size={14} className="mr-1.5 opacity-70" />
                            Storage Usage
                        </div>
                        <button type="button" className="rfm-facts-toggle-btn" onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFactsMinimized(!factsMinimized);
                        }}>
                            <SvgIcon svgType={factsMinimized ? "plus" : "minus"} size={12} />
                        </button>
                    </div>

                    {!factsMinimized ? (
                        <div className="rfm-facts-container">
                            <div className="rfm-facts-content">
                                <div className="flex items-center gap-4 mb-3 mt-1">
                                    <div className="rfm-facts-pie-container">
                                        {usedStorage > 0 ? (
                                            <svg className="rfm-facts-pie-svg" viewBox="0 0 32 32">
                                                {/* Background Circle */}
                                                <circle r="12" cx="16" cy="16" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-stone-200 dark:text-slate-700" />
                                                {/* Progress Circle (Circumference = 2 * pi * 12 ~= 75.4) */}
                                                <circle r="12" cx="16" cy="16" fill="transparent"
                                                    stroke="#0d9488"
                                                    strokeWidth="4"
                                                    strokeDasharray={`${(storagePercentage / 100) * 75.4} 75.4`}
                                                    strokeLinecap="round"
                                                />
                                                <text x="16" y="16" textAnchor="middle" dominantBaseline="central" className="rfm-pie-percentage">{storagePercentage}%</text>
                                            </svg>
                                        ) : (
                                            <div className="rfm-facts-pie-empty" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="rfm-fact-item truncate">
                                            {formatSize(usedStorage)} of {formatSize(totalStorage)}
                                        </div>
                                        <div className="text-[10px] text-stone-500 dark:text-slate-400 font-medium">
                                            {formatSize(totalStorage - usedStorage)} free
                                        </div>
                                    </div>
                                </div>

                                <div className="rfm-fact-category-list">
                                    {sortedCategories.slice(0, 3).map((item) => (
                                        <div key={item.label} className="rfm-fact-sub-item">
                                            <span className="dot" style={{ backgroundColor: getCategoryColor(item.label) }} />
                                            <span className="flex-1 truncate capitalize">{item.cat}</span>
                                            <span className="font-semibold text-stone-700 dark:text-slate-300 text-[10px]">
                                                {item.count} items
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="rfm-facts-minimized-info" onClick={() => setFactsMinimized(false)}>
                            {storagePercentage}% used • {formatSize(usedStorage)}
                        </div>
                    )}
                </div>
            )}
        </aside>
    );
};

// Helper for category colors
const getCategoryColor = (cat: string): string => {
    switch (cat.toLowerCase()) {
        case 'images': return '#f43f5e';
        case 'videos': return '#8b5cf6';
        case 'documents': return '#0ea5e9';
        case 'archives': return '#f59e0b';
        case 'audio': return '#10b981';
        default: return '#94a3b8';
    }
};

export default Sidebar;
