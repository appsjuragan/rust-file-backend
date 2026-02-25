import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
// Context
import { FileManagerContext } from "./context";
import { useMediaQuery } from "./hooks/useMediaQuery";
// Components
import {
  Navbar,
  Workspace,
  Sidebar,
  NewFolderModal,
  PreviewModal,
  UploadProgressToast,
  ContextMenu,
  MetadataModal,
  RenameModal,
  OperationToast,
  DialogModal,
  ShareModal,
  ShareAccessLogModal,
} from "./components";
// Types
import type { FileSystemType, FileType, FolderNode, ShareLink } from "./types";
import {
  ViewStyle,
  UploadStatus,
  SortField,
  SortDirection,
  IconSize,
} from "./types";
// HTTP Client
import { setOnRequestCallback } from "../src/services/httpClient";
import { fileService } from "../src/services/fileService";

export interface IFileManagerProps {
  fs: FileSystemType;
  viewOnly?: boolean;
  onDoubleClick?: (id: string) => Promise<void>;
  onRefresh?: (id: string) => Promise<void>;
  onUpload?: (
    files: { file: File; path: string }[],
    folderId: string
  ) => Promise<void>;
  onCreateFolder?: (folderName: string) => Promise<void>;
  onDelete?: (fileId: string) => Promise<void>;
  onMove?: (id: string, newParentId: string) => Promise<void>;
  onRename?: (id: string, newName: string) => Promise<void>;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  onBulkMove?: (ids: string[], newParentId: string) => Promise<void>;
  onBulkCopy?: (ids: string[], newParentId: string) => Promise<void>;
  onCancelUpload?: (id: string) => Promise<void>;
  currentFolder?: string;
  setCurrentFolder?: (id: string) => void;
  activeUploads?: UploadStatus[];
  setActiveUploads?: (
    val: UploadStatus[] | ((prev: UploadStatus[]) => UploadStatus[])
  ) => void;
  userFacts?: any;
  highlightedId?: string | null;
  setHighlightedId?: (id: string | null) => void;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  folderTree?: FolderNode[];
  refreshFolderTree?: () => Promise<void>;
  sidebarVisible?: boolean;
  setSidebarVisible?: (visible: boolean) => void;
  userId?: string;
  favorites?: FileType[];
  onToggleFavorite?: (file: FileType | FileType[]) => void;
}

export const ReactFileManager = ({
  fs,
  viewOnly,
  onDoubleClick,
  onRefresh,
  onUpload,
  onCreateFolder,
  onDelete,
  onMove,
  onRename,
  onBulkDelete,
  onBulkMove,
  onBulkCopy,
  onCancelUpload,
  currentFolder: propCurrentFolder,
  setCurrentFolder: propSetCurrentFolder,
  activeUploads: propActiveUploads,
  setActiveUploads: propSetActiveUploads,
  userFacts,
  highlightedId,
  setHighlightedId,
  onLoadMore,
  hasMore,
  isLoadingMore,
  folderTree: propFolderTree,
  refreshFolderTree,
  sidebarVisible: propSidebarVisible,
  setSidebarVisible: propSetSidebarVisible,
  userId,
  favorites: propFavorites,
  onToggleFavorite: propOnToggleFavorite,
}: IFileManagerProps) => {
  const [internalCurrentFolder, setInternalCurrentFolder] =
    useState<string>("0");
  const currentFolder = propCurrentFolder ?? internalCurrentFolder;
  const setCurrentFolder = propSetCurrentFolder ?? setInternalCurrentFolder;

  const [uploadedFileData, setUploadedFileData] = useState<any>();
  const [viewStyle, setViewStyle] = useState<ViewStyle>(ViewStyle.List);
  const [internalActiveUploads, setInternalActiveUploads] = useState<
    UploadStatus[]
  >([]);
  const activeUploads = propActiveUploads ?? internalActiveUploads;
  const setActiveUploads = (val: any) => {
    if (propSetActiveUploads) {
      propSetActiveUploads(val);
    } else {
      setInternalActiveUploads(val);
    }
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboardIds, setClipboardIds] = useState<string[]>([]);
  const [clipboardSourceFolder, setClipboardSourceFolder] = useState<
    string | null
  >(null);
  const [isCut, setIsCut] = useState<boolean>(false);
  const [newFolderModalVisible, setNewFolderModalVisible] =
    useState<boolean>(false);
  const [previewVisible, setPreviewVisible] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<FileType | null>(null);
  const [metadataVisible, setMetadataVisible] = useState<boolean>(false);
  const [metadataFile, setMetadataFile] = useState<FileType | null>(null);
  const [renameVisible, setRenameVisible] = useState<boolean>(false);
  const [renameFile, setRenameFile] = useState<FileType | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: FileType | null;
  } | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState<boolean>(false);
  const [shareFile, setShareFile] = useState<FileType | null>(null);
  const [accessLogVisible, setAccessLogVisible] = useState<boolean>(false);
  const [accessLogFile, setAccessLogFile] = useState<FileType | null>(null);
  // Responsive sidebar
  const isDesktop = useMediaQuery("(min-width: 769px)");
  const [internalSidebarVisible, setInternalSidebarVisible] =
    useState<boolean>(isDesktop);
  const prevIsDesktop = useRef(isDesktop);

  useEffect(() => {
    if (prevIsDesktop.current !== isDesktop) {
      setInternalSidebarVisible(isDesktop);
      prevIsDesktop.current = isDesktop;
    }
  }, [isDesktop]);

  const sidebarVisible = propSidebarVisible ?? internalSidebarVisible;
  const setSidebarVisible = propSetSidebarVisible ?? setInternalSidebarVisible;

  const [sortField, setSortField] = useState<SortField>(SortField.Name);
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    SortDirection.Asc
  );
  const [iconSize, setIconSize] = useState<IconSize>(IconSize.Medium);

  // Favorites state
  const [internalFavorites, setInternalFavorites] = useState<FileType[]>([]);
  const favorites = propFavorites ?? internalFavorites;
  const setFavorites = setInternalFavorites;
  const [favoritesMinimized, setFavoritesMinimized] = useState<boolean>(false);
  const [storageUsageMinimized, setStorageUsageMinimized] =
    useState<boolean>(false);
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [sharesMinimized, setSharesMinimized] = useState<boolean>(false);

  const refreshShares = useCallback(async () => {
    try {
      const allShares = await fileService.listShares();
      setShares(allShares || []);
    } catch {
      /* quiet */
    }
  }, []);

  // Load sort preferences and icon size when userId changes
  useEffect(() => {
    if (!userId) return;
    const savedField = localStorage.getItem(`rfm_sortField_${userId}`);
    const savedDirection = localStorage.getItem(`rfm_sortDirection_${userId}`);
    const savedIconSize = localStorage.getItem(`rfm_iconSize_${userId}`);
    const savedViewStyle = localStorage.getItem(`rfm_viewStyle_${userId}`);
    const savedSidebarVisible = localStorage.getItem(
      `rfm_sidebarVisible_${userId}`
    );
    const savedCurrentFolder = localStorage.getItem(
      `rfm_currentFolder_${userId}`
    );

    if (savedField) setSortField(savedField as SortField);
    if (savedDirection) setSortDirection(savedDirection as SortDirection);
    if (savedIconSize) setIconSize(savedIconSize as IconSize);
    if (savedViewStyle) setViewStyle(savedViewStyle as ViewStyle);
    if (savedSidebarVisible)
      setInternalSidebarVisible(savedSidebarVisible === "true");
    // Only restore if we are at root ("0") to avoid overriding active navigation
    // if (savedCurrentFolder && !propCurrentFolder && internalCurrentFolder === "0") {
    //   setInternalCurrentFolder(savedCurrentFolder);
    // }

    const savedFavorites = localStorage.getItem(`rfm_favorites_${userId}`);
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch (e) {
        console.error("Failed to parse favorites", e);
      }
    }

    const savedFavoritesMinimized = localStorage.getItem(
      `rfm_favoritesMinimized_${userId}`
    );
    if (savedFavoritesMinimized)
      setFavoritesMinimized(savedFavoritesMinimized === "true");

    const savedStorageUsageMinimized = localStorage.getItem(
      `rfm_storageUsageMinimized_${userId}`
    );
    if (savedStorageUsageMinimized)
      setStorageUsageMinimized(savedStorageUsageMinimized === "true");

    const savedSharesMinimized = localStorage.getItem(
      `rfm_sharesMinimized_${userId}`
    );
    if (savedSharesMinimized)
      setSharesMinimized(savedSharesMinimized === "true");
  }, [userId, internalCurrentFolder]);

  useEffect(() => {
    refreshShares();
  }, [refreshShares]);

  // Save preferences when they change
  useEffect(() => {
    if (!userId) return;
    localStorage.setItem(`rfm_sortField_${userId}`, sortField);
    localStorage.setItem(`rfm_sortDirection_${userId}`, sortDirection);
    localStorage.setItem(`rfm_iconSize_${userId}`, iconSize);
    localStorage.setItem(`rfm_viewStyle_${userId}`, viewStyle);
    localStorage.setItem(
      `rfm_sidebarVisible_${userId}`,
      String(internalSidebarVisible)
    );
    localStorage.setItem(`rfm_currentFolder_${userId}`, currentFolder);
    localStorage.setItem(
      `rfm_sharesMinimized_${userId}`,
      String(sharesMinimized)
    );
  }, [
    sortField,
    sortDirection,
    iconSize,
    viewStyle,
    internalSidebarVisible,
    currentFolder,
    userId,
    sharesMinimized,
  ]);

  // Persist favorites
  useEffect(() => {
    if (!userId) return;
    localStorage.setItem(`rfm_favorites_${userId}`, JSON.stringify(favorites));
  }, [favorites, userId]);

  // Persist accordion states
  useEffect(() => {
    if (!userId) return;
    localStorage.setItem(
      `rfm_favoritesMinimized_${userId}`,
      String(favoritesMinimized)
    );
    localStorage.setItem(
      `rfm_storageUsageMinimized_${userId}`,
      String(storageUsageMinimized)
    );
  }, [favoritesMinimized, storageUsageMinimized, userId]);

  const toggleFavorite = (file: FileType | FileType[]) => {
    if (propOnToggleFavorite) {
      propOnToggleFavorite(file);
      return;
    }
    const filesArray = Array.isArray(file) ? file : [file];
    setFavorites((prev) => {
      let next = [...prev];
      const allSelectedAreFavorites = filesArray.every((item) =>
        next.some((f) => f.id === item.id)
      );

      if (allSelectedAreFavorites) {
        // Remove all selected from favorites
        const idsToRemove = new Set(filesArray.map((f) => f.id));
        next = next.filter((f) => !idsToRemove.has(f.id));
      } else {
        // Add only those that are not already favorites
        for (const item of filesArray) {
          if (!next.some((f) => f.id === item.id)) {
            next.unshift(item);
          }
        }
      }

      // Limit favorites to prevent UI clutter
      if (next.length > 24) {
        return next.slice(next.length - 24);
      }
      return next;
    });
  };

  const sortedFs = useMemo(() => {
    return [...fs].sort((a, b) => {
      // Folders always first
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;

      let comparison = 0;
      switch (sortField) {
        case SortField.Name:
          comparison = a.name.localeCompare(b.name);
          break;
        case SortField.Size:
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case SortField.Type:
          comparison = (a.mimeType || "").localeCompare(b.mimeType || "");
          break;
        case SortField.Date:
          comparison = (a.lastModified || 0) - (b.lastModified || 0);
          break;
      }

      return sortDirection === SortDirection.Asc ? comparison : -comparison;
    });
  }, [fs, sortField, sortDirection]);

  const filesByParent = useMemo(() => {
    const map = new Map<string, FileType[]>();
    for (const f of sortedFs) {
      if (f.name === "/") continue;
      const pid = f.parentId || "0";
      const list = map.get(pid);
      if (list) {
        list.push(f);
      } else {
        map.set(pid, [f]);
      }
    }
    return map;
  }, [sortedFs]);

  const [openUploadDummy, setOpenUploadDummy] = useState<number>(0);
  const openUploadRef = useRef<(() => void) | null>(null);

  const triggerOpenUpload = useCallback(() => {
    openUploadRef.current?.();
  }, []);

  const registerOpenUpload = useCallback((fn: (() => void) | null) => {
    openUploadRef.current = fn;
    setOpenUploadDummy((prev) => prev + 1); // Only to trigger re-render of components using the trigger if needed, but ContextMenu uses triggerOpenUpload which is STABLE
  }, []);
  const [modalPosition, setModalPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const [resetSignal, setResetSignal] = useState(0);
  const folderTree = propFolderTree ?? [];

  const resetUploadToastCountdown = useCallback(() => {
    setResetSignal((s) => s + 1);
  }, []);

  // Register the reset callback with the HTTP client
  useEffect(() => {
    setOnRequestCallback(resetUploadToastCountdown);

    return () => {
      setOnRequestCallback(null);
    };
  }, [resetUploadToastCountdown]);

  const [dialogState, setDialogState] = useState<{
    isVisible: boolean;
    title: string;
    message: string;
    type: "alert" | "confirm";
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    isVisible: false,
    title: "",
    message: "",
    type: "alert",
  });

  const showAlert = (message: string, title: string = "Alert") => {
    setDialogState({
      isVisible: true,
      title,
      message,
      type: "alert",
    });
  };

  const showConfirm = (
    message: string,
    onConfirm: () => void,
    title: string = "Confirm"
  ) => {
    setDialogState({
      isVisible: true,
      title,
      message,
      type: "confirm",
      onConfirm,
    });
  };

  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (message: any) => {
      showAlert(String(message));
    };
    return () => {
      window.alert = originalAlert;
    };
  }, [showAlert]);

  // Wrap handlers to refresh shares
  const wrappedOnDelete = useCallback(
    async (id: string) => {
      if (onDelete) {
        await onDelete(id);
        refreshShares();
        setFavorites((prev) => {
          const toRemove = new Set([id]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const f of prev) {
              if (!toRemove.has(f.id) && f.parentId && toRemove.has(f.parentId)) {
                toRemove.add(f.id);
                changed = true;
              }
            }
          }
          return prev.filter((f) => !toRemove.has(f.id));
        });
      }
    },
    [onDelete, refreshShares]
  );

  const wrappedOnBulkDelete = useCallback(
    async (ids: string[]) => {
      if (onBulkDelete) {
        await onBulkDelete(ids);
        refreshShares();
        setFavorites((prev) => {
          const toRemove = new Set(ids);
          let changed = true;
          while (changed) {
            changed = false;
            for (const f of prev) {
              if (!toRemove.has(f.id) && f.parentId && toRemove.has(f.parentId)) {
                toRemove.add(f.id);
                changed = true;
              }
            }
          }
          return prev.filter((f) => !toRemove.has(f.id));
        });
      }
    },
    [onBulkDelete, refreshShares]
  );

  const wrappedOnRename = useCallback(
    async (id: string, newName: string) => {
      if (onRename) {
        await onRename(id, newName);
        refreshShares();
      }
    },
    [onRename, refreshShares]
  );

  const wrappedOnMove = useCallback(
    async (id: string, newParentId: string) => {
      if (onMove) {
        await onMove(id, newParentId);
        refreshShares();
      }
    },
    [onMove, refreshShares]
  );

  const wrappedOnBulkMove = useCallback(
    async (ids: string[], newParentId: string) => {
      if (onBulkMove) {
        await onBulkMove(ids, newParentId);
        refreshShares();
      }
    },
    [onBulkMove, refreshShares]
  );

  // ─── Sub-memos: each slice only re-computes when its own state changes ───

  // 1. File system + navigation (changes when files load or folder changes)
  const fsValue = useMemo(
    () => ({
      fs: sortedFs,
      filesByParent,
      currentFolder,
      setCurrentFolder,
      viewOnly,
      onDoubleClick,
      onRefresh,
      onUpload,
      onCancelUpload,
      onCreateFolder,
      onDelete: wrappedOnDelete,
      onMove: wrappedOnMove,
      onRename: wrappedOnRename,
      onBulkDelete: wrappedOnBulkDelete,
      onBulkMove: wrappedOnBulkMove,
      onBulkCopy,
      onLoadMore,
      hasMore,
      isLoadingMore,
      highlightedId,
      setHighlightedId,
      folderTree,
      refreshFolderTree,
    }),
    [
      sortedFs,
      filesByParent,
      currentFolder,
      viewOnly,
      onDoubleClick,
      onRefresh,
      onUpload,
      onCancelUpload,
      onCreateFolder,
      onDelete,
      onMove,
      onRename,
      onBulkDelete,
      onBulkMove,
      onBulkCopy,
      onLoadMore,
      hasMore,
      isLoadingMore,
      highlightedId,
      folderTree,
      refreshFolderTree,
    ]
  );

  // 2. UI preferences (changes when user changes view/sort/size)
  const uiValue = useMemo(
    () => ({
      viewStyle,
      setViewStyle,
      sortField,
      setSortField,
      sortDirection,
      setSortDirection,
      iconSize,
      setIconSize,
      sidebarVisible,
      setSidebarVisible,
      uploadedFileData,
      setUploadedFileData,
    }),
    [
      viewStyle,
      sortField,
      sortDirection,
      iconSize,
      sidebarVisible,
      uploadedFileData,
    ]
  );

  // 3. Selection + clipboard (changes on every user selection action)
  const selectionValue = useMemo(
    () => ({
      selectedIds,
      setSelectedIds,
      clipboardIds,
      setClipboardIds,
      isCut,
      setIsCut,
      clipboardSourceFolder,
      setClipboardSourceFolder,
    }),
    [selectedIds, clipboardIds, isCut, clipboardSourceFolder]
  );

  // 4. Modals (changes when any modal opens/closes)
  const modalValue = useMemo(
    () => ({
      newFolderModalVisible,
      setNewFolderModalVisible,
      previewVisible,
      setPreviewVisible,
      previewFile,
      setPreviewFile,
      metadataVisible,
      setMetadataVisible,
      metadataFile,
      setMetadataFile,
      renameVisible,
      setRenameVisible,
      renameFile,
      setRenameFile,
      contextMenu,
      setContextMenu,
      openUpload: triggerOpenUpload,
      setOpenUpload: registerOpenUpload,
      modalPosition,
      setModalPosition,
      isMoving,
      setIsMoving,
      dialogState,
      setDialogState,
      showAlert,
      showConfirm,
      shareModalVisible,
      setShareModalVisible,
      shareFile,
      setShareFile,
      accessLogVisible,
      setAccessLogVisible,
      accessLogFile,
      setAccessLogFile,
    }),
    [
      newFolderModalVisible,
      previewVisible,
      previewFile,
      metadataVisible,
      metadataFile,
      renameVisible,
      renameFile,
      contextMenu,
      triggerOpenUpload,
      registerOpenUpload,
      modalPosition,
      isMoving,
      dialogState,
      shareModalVisible,
      shareFile,
      accessLogVisible,
      accessLogFile,
    ]
  );

  // 5. Uploads (changes when upload progress updates)
  const uploadValue = useMemo(
    () => ({
      activeUploads,
      setActiveUploads,
      resetUploadToastCountdown,
      resetSignal,
    }),
    [activeUploads, resetUploadToastCountdown, resetSignal]
  );

  // 6. Sidebar extras: favorites, storage stats (changes infrequently)
  const sidebarExtrasValue = useMemo(
    () => ({
      userFacts,
      favorites,
      toggleFavorite,
      favoritesMinimized,
      setFavoritesMinimized,
      storageUsageMinimized,
      setStorageUsageMinimized,
      shares,
      setShares,
      refreshShares,
      sharesMinimized,
      setSharesMinimized,
    }),
    [
      userFacts,
      favorites,
      toggleFavorite,
      favoritesMinimized,
      storageUsageMinimized,
      shares,
      sharesMinimized,
    ]
  );

  // Final context value: spread all sub-memos.
  // Only re-creates when one of the 6 sub-objects changes reference.
  const contextValue = useMemo(
    () => ({
      ...fsValue,
      ...uiValue,
      ...selectionValue,
      ...modalValue,
      ...uploadValue,
      ...sidebarExtrasValue,
    }),
    [
      fsValue,
      uiValue,
      selectionValue,
      modalValue,
      uploadValue,
      sidebarExtrasValue,
    ]
  );

  return (
    <FileManagerContext.Provider value={contextValue}>
      <div className="rfm-main-container">
        <div className="rfm-content-container">
          {/* Mobile Overlay for Sidebar */}
          {sidebarVisible && (
            <div
              className="rfm-sidebar-overlay"
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.4)",
                backdropFilter: "blur(2px)",
                zIndex: 5900,
                display: "none", // Managed by CSS media query
              }}
              onClick={() => setSidebarVisible(false)}
            />
          )}
          <Sidebar />
          <Workspace />
        </div>
        {!viewOnly && (
          <>
            <NewFolderModal
              isVisible={newFolderModalVisible}
              onClose={() => setNewFolderModalVisible(false)}
              clickPosition={modalPosition}
            />
            {previewFile && (
              <PreviewModal
                isVisible={previewVisible}
                onClose={() => setPreviewVisible(false)}
                fileName={previewFile.name}
                fileId={previewFile.id}
                mimeType={previewFile.mimeType}
                size={previewFile.size}
                scanStatus={previewFile.scanStatus}
                clickPosition={modalPosition}
              />
            )}
          </>
        )}
        <UploadProgressToast />
        <OperationToast />
        <DialogModal />
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            file={contextMenu.file}
            onClose={() => setContextMenu(null)}
            onPreview={(file) => {
              setModalPosition({ x: contextMenu.x, y: contextMenu.y });
              setPreviewFile(file);
              setPreviewVisible(true);
            }}
            onViewMetadata={(file) => {
              setModalPosition({ x: contextMenu.x, y: contextMenu.y });
              setMetadataFile(file);
              setMetadataVisible(true);
            }}
            onRename={(file) => {
              setModalPosition({ x: contextMenu.x, y: contextMenu.y });
              setRenameFile(file);
              setRenameVisible(true);
            }}
            onNewFolder={() => {
              setModalPosition({ x: contextMenu.x, y: contextMenu.y });
              setNewFolderModalVisible(true);
            }}
            onUpload={triggerOpenUpload}
            onShare={(file) => {
              setShareFile(file);
              setShareModalVisible(true);
            }}
            onViewAccessLog={(file) => {
              setAccessLogFile(file);
              setAccessLogVisible(true);
            }}
          />
        )}
        <ShareModal
          isVisible={shareModalVisible}
          file={shareFile}
          onClose={() => setShareModalVisible(false)}
          onCreateShare={async (params) => {
            const result = await fileService.createShare(params);
            refreshShares();
            return result;
          }}
          onListShares={fileService.listShares}
          onRevokeShare={async (shareId) => {
            await fileService.revokeShare(shareId);
            refreshShares();
          }}
        />
        <ShareAccessLogModal
          isVisible={accessLogVisible}
          file={accessLogFile}
          onClose={() => setAccessLogVisible(false)}
          onListShares={fileService.listShares}
          onGetLogs={fileService.getShareLogs}
        />
        <MetadataModal
          isVisible={metadataVisible}
          onClose={() => setMetadataVisible(false)}
          file={metadataFile}
          clickPosition={modalPosition}
        />
        <RenameModal
          isVisible={renameVisible}
          onClose={() => setRenameVisible(false)}
          currentName={renameFile?.name || ""}
          clickPosition={modalPosition}
          onRename={(newName) => {
            if (renameFile && onRename) {
              onRename(renameFile.id, newName);
            }
          }}
        />
      </div>
    </FileManagerContext.Provider>
  );
};
