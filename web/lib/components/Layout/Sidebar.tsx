import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useFileManager } from "../../context";
import SvgIcon from "../Icons/SvgIcon";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { fileService } from "../../../src/services/fileService";

// Extracted sub-components
import FolderTreeItem, { buildChildrenMap } from "./FolderTreeItem";
import FavoritesSection from "./FavoritesSection";
import SharesSection from "./SharesSection";
import StorageUsage from "./StorageUsage";
import type { FolderNode } from "../../types";

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
    storageUsageMinimized: factsMinimized,
    setStorageUsageMinimized: setFactsMinimized,
    toggleFavorite,
    shares,
    sharesMinimized,
    setSharesMinimized,
    refreshShares,
  } = useFileManager();
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set<string>()
  );
  const isMobile = !useMediaQuery("(min-width: 769px)");

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
        setExpandedIds((prev) => {
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
    setExpandedIds((prev) => {
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

  const handleRootClick = () => {
    setCurrentFolder("0");
    if (isMobile && setSidebarVisible) {
      setSidebarVisible(false);
    }
  };

  const activeShares = useMemo(() => {
    return shares
      .filter((s) => new Date(s.expires_at) > new Date())
      .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
  }, [shares]);

  return (
    <aside className={`rfm-sidebar ${!sidebarVisible ? "is-hidden" : ""}`}>
      <div className="rfm-sidebar-header">
        <div className="rfm-app-logo">
          <SvgIcon svgType="rocket" className="rfm-app-logo-icon" />
        </div>
        <div className="rfm-app-title">
          <span className="rfm-app-title-main">
            Juragan <span className="rfm-app-title-sub">Cloud</span>
          </span>
        </div>
      </div>
      <div className="rfm-sidebar-list">
        <div
          className={`rfm-sidebar-item ${currentFolder === "0" ? "active" : ""
            } ${isDragOverRoot ? "rfm-drag-over" : ""}`}
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
          <span className="rfm-sidebar-item-text" data-text="Home">
            Home
          </span>
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
              idToNodeMap={idToNodeMap}
            />
          ))}
        </div>
      </div>

      {/* Favorites Accordion */}
      <FavoritesSection
        favorites={favorites}
        isMinimized={favoritesMinimized}
        onToggleMinimized={() => setFavoritesMinimized(!favoritesMinimized)}
        onRemoveFavorite={(fav) => toggleFavorite(fav)}
        onSelectFavorite={(item) => {
          if (item.isDir) {
            setCurrentFolder(item.id);
            if (isMobile && setSidebarVisible) {
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
              if (isMobile && setSidebarVisible) {
                setSidebarVisible(false);
              }
            }
          }
        }}
      />

      {/* Shares Accordion */}
      <SharesSection
        activeShares={activeShares}
        isMinimized={sharesMinimized}
        onToggleMinimized={() => setSharesMinimized(!sharesMinimized)}
        onRemoveShare={async (share) => {
          try {
            await fileService.revokeShare(share.id);
            refreshShares();
          } catch { /* ignore */ }
        }}
        onCopyShareLink={(share) => {
          navigator.clipboard.writeText(`${window.location.origin}/s/${share.share_token}`);
        }}
        onSelectShare={(share) => {
          if (share.is_folder) {
            setCurrentFolder(share.user_file_id);
            if (onRefresh) {
              onRefresh(share.user_file_id).catch(() => { });
            }
            if (isMobile && setSidebarVisible) {
              setSidebarVisible(false);
            }
          } else {
            const pid = share.parent_id || "0";
            setCurrentFolder(pid);
            if (onRefresh) {
              onRefresh(pid).catch(() => { });
            }
            setTimeout(() => {
              if (setHighlightedId) {
                setHighlightedId(share.user_file_id);
              }
            }, 100);
            if (isMobile && setSidebarVisible) {
              setSidebarVisible(false);
            }
          }
        }}
      />

      {/* Storage Statistics */}
      <StorageUsage
        userFacts={userFacts}
        isMinimized={factsMinimized}
        onToggleMinimized={() => setFactsMinimized(!factsMinimized)}
      />
    </aside>
  );
};

export default Sidebar;
