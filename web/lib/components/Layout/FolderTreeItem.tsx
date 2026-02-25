import React, { useState } from "react";
import { useFileManager } from "../../context";
import SvgIcon from "../Icons/SvgIcon";
import type { FileType, FolderNode } from "../../types";
import { isDescendantOrSelf } from "../../utils/fileUtils";
import { useMediaQuery } from "../../hooks/useMediaQuery";

// Build a map of parentId -> children for O(1) child lookups
export const buildChildrenMap = (tree: FolderNode[]): Map<string, FolderNode[]> => {
    const map = new Map<string, FolderNode[]>();
    for (const node of tree) {
        let key = node.parent_id || "0";
        if (key === "root") key = "0";

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
export const nodeToFileType = (node: FolderNode): FileType => ({
    id: node.id,
    name: node.filename,
    isDir: true,
    parentId: node.parent_id ?? "0",
});

export interface FolderTreeItemProps {
    node: FolderNode;
    childrenMap: Map<string, FolderNode[]>;
    level: number;
    expandedIds: Set<string>;
    onToggle: (id: string) => void;
    idToNodeMap: Map<string, FolderNode>;
}

const FolderTreeItem = ({
    node,
    childrenMap,
    level,
    expandedIds,
    onToggle,
    idToNodeMap,
}: FolderTreeItemProps) => {
    const {
        fs,
        currentFolder,
        setCurrentFolder,
        onRefresh,
        setContextMenu,
        onBulkMove,
        onMove,
        selectedIds,
        setSelectedIds,
        setIsMoving,
        setSidebarVisible,
    } = useFileManager();
    const [isDragOver, setIsDragOver] = useState(false);
    const isMobile = !useMediaQuery("(min-width: 769px)");

    const children = childrenMap.get(node.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    const handleDragOver = (e: React.DragEvent) => {
        // Use O(1) lookup via callback
        const getParentId = (id: string) => idToNodeMap.get(id)?.parent_id;
        const canDrop = !selectedIds.some((id) =>
            isDescendantOrSelf(getParentId, id, node.id)
        );
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
            // Use O(1) lookup via callback
            const getParentId = (id: string) => idToNodeMap.get(id)?.parent_id;
            const validIds = idsToMove.filter(
                (id: string) => !isDescendantOrSelf(getParentId, id, node.id)
            );
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

    const handleFolderClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        // 1. Navigate immediately
        setCurrentFolder(node.id);

        // 2. Trigger data fetch if callback exists
        if (onRefresh) {
            onRefresh(node.id).catch((err) =>
                console.error("Sidebar navigation refresh failed", err)
            );
        }

        const isExpanding = hasChildren && !isExpanded;
        // 3. Auto-expand if we are currently collapsed
        if (isExpanding) {
            onToggle(node.id);
        }

        // 4. Handle mobile sidebar auto-hide
        if (isMobile && setSidebarVisible) {
            // Only hide if we aren't drilling down into a sub-tree
            if (!isExpanding) {
                setTimeout(() => setSidebarVisible(false), 50);
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
                className={`rfm-sidebar-item ${currentFolder === node.id ? "active" : ""
                    } ${isDragOver ? "rfm-drag-over" : ""}`}
                style={{ paddingLeft: `${Math.max(0.75, level * 0.75)}rem` }}
                onClick={handleFolderClick}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentFolder(node.id);
                    setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        file: nodeToFileType(node),
                    });
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
                        <SvgIcon
                            svgType={isExpanded ? "arrow-down" : "arrow-right"}
                            className="rfm-chevron-icon"
                        />
                    </span>
                ) : (
                    <span className="rfm-sidebar-chevron rfm-chevron-spacer" />
                )}
                <SvgIcon svgType="folder" className="rfm-sidebar-icon" />
                <span className="rfm-sidebar-item-text" data-text={node.filename}>
                    {node.filename}
                </span>
            </div>

            {isExpanded && children.length > 0 && (
                <div className="rfm-sidebar-subfolders">
                    {children.map((child) => (
                        <FolderTreeItem
                            key={child.id}
                            node={child}
                            childrenMap={childrenMap}
                            level={level + 1}
                            expandedIds={expandedIds}
                            onToggle={onToggle}
                            idToNodeMap={idToNodeMap}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default FolderTreeItem;
