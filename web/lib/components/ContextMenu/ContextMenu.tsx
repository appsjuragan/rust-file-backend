import React, { useEffect, useRef, useState } from "react";
import { useFileManager } from "../../context";
import { FileType, FolderNode } from "../../types";
import SvgIcon from "../Icons/SvgIcon";
import { fileService } from "../../../src/services/fileService";
import { useFileActions } from "../../hooks/useFileActions";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { isEditableTextFile } from "../Modals/TextEditorModal";
import { formatSize } from "../../utils/fileUtils";

interface IContextMenuProps {
  x: number;
  y: number;
  file: FileType | null;
  onClose: () => void;
  onPreview: (file: FileType) => void;
  onViewMetadata: (file: FileType) => void;
  onRename: (file: FileType) => void;
  onEdit?: (file: FileType) => void;
  onNewFolder: () => void;
  onNewTextFile: () => void;
  onUpload: () => void;
  onShare?: (file: FileType) => void;
  onViewAccessLog?: (file: FileType) => void;
}

const ContextMenu: React.FC<IContextMenuProps> = ({
  x,
  y,
  file,
  onClose,
  onPreview,
  onViewMetadata,
  onRename,
  onEdit,
  onNewFolder,
  onNewTextFile,
  onUpload,
  onShare,
  onViewAccessLog,
}) => {
  const {
    fs,
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
    favorites,
    toggleFavorite,
    folderTree,
  } = useFileManager();

  const [stats, setStats] = useState<{
    total_items: number;
    total_size: number;
    file_count: number;
    folder_count: number;
  } | null>(null);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);

  const isTargetTrash = file?.isSystem && (file.name === "Trash" || file.name === ".Trash");

  useEffect(() => {
    if (isTargetTrash && file?.id) {
      fileService.getFolderStats(file.id).then(setStats).catch(console.error);
    }
  }, [isTargetTrash, file?.id]);

  const handleEmptyTrash = () => {
    if (!file?.id) return;
    setShowEmptyTrashConfirm(true);
  };

  const confirmEmptyTrash = async () => {
    if (!file?.id) return;
    setShowEmptyTrashConfirm(false);
    onClose();
    if (setDialogState) {
      setDialogState({
        isVisible: true,
        title: "Emptying Trash",
        message: "Permanently deleting all items in Trash...",
        type: "alert",
      });
    }
    try {
      await fileService.emptyTrash(file.id);
      if (onRefresh) await onRefresh(currentFolder);
      if (setDialogState) setDialogState({ isVisible: false } as any);
    } catch (error) {
      console.error("Failed to empty trash", error);
      if (setDialogState) setDialogState({ isVisible: false } as any);
      alert("Failed to empty trash.");
    }
  };

  const {
    handleCopy: hookHandleCopy,
    handleCut: hookHandleCut,
    handleDelete: hookHandleDelete,
    handlePaste: hookHandlePaste,
    handleBulkDownload,
  } = useFileActions();

  const menuRef = useRef<HTMLDivElement>(null);
  const isMobile = !useMediaQuery("(min-width: 769px)");

  const mountTime = useRef(Date.now());
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      // Ignore events within first 150ms of mount to prevent catching the same interaction
      if (Date.now() - mountTime.current < 150) return;

      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // Back button handling for Mobile Context Menu
  useEffect(() => {
    if (isMobile) {
      const stateId = `context-menu-${Math.random().toString(36).substr(2, 9)}`;
      window.history.pushState({ contextId: stateId }, "");

      const handlePopState = (e: PopStateEvent) => {
        if (e.state?.contextId !== stateId) {
          onCloseRef.current();
        }
      };

      const timer = setTimeout(() => {
        window.addEventListener("popstate", handlePopState);
      }, 50);

      return () => {
        clearTimeout(timer);
        window.removeEventListener("popstate", handlePopState);
        if (window.history.state?.contextId === stateId) {
          window.history.back();
        }
      };
    }
  }, [isMobile]);

  const triggerAction = (action: () => void) => {
    onClose();
    if (isMobile) {
      setTimeout(action, 100);
    } else {
      action();
    }
  };

  const handleOpen = () => {
    if (file) {
      triggerAction(() => onPreview(file));
    } else {
      onClose();
    }
  };

  const handleDownload = async () => {
    onClose();

    // Determine if this is a single non-folder file
    const singleFile = file && !file.isDir ? file
      : (selectedIds.length === 1
        ? fs.find((f) => f.id === selectedIds[0] && !f.isDir) || null
        : null);

    // Single non-folder file → direct download via ticket (no ZIP)
    if (singleFile && selectedIds.length <= 1) {
      try {
        const res = await fileService.getDownloadTicket(singleFile.id);
        const url = res.url;
        const link = document.createElement("a");
        link.href = url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
        link.download = singleFile.name;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error("Failed to initiate download:", err);
        alert("Failed to prepare download. Please try again.");
      }
      return;
    }

    // Multi-select or folder(s) → bulk ZIP download
    const ids = selectedIds.length > 0 ? selectedIds : (file ? [file.id] : []);
    if (ids.length > 0) {
      handleBulkDownload(ids);
    }
  };

  const handleViewMetadata = () => {
    if (file) {
      triggerAction(() => onViewMetadata(file));
    } else {
      onClose();
    }
  };

  const handleRename = () => {
    if (file) {
      triggerAction(() => onRename(file));
    } else {
      onClose();
    }
  };

  const handleDelete = async () => {
    const action = () => {
      if (selectedIds.length > 0) {
        hookHandleDelete();
      } else if (file) {
        hookHandleDelete([file.id], file.name);
      }
    };

    triggerAction(action);
  };

  const handleCopy = () => {
    if (selectedIds.length > 0) {
      hookHandleCopy();
    } else if (file) {
      hookHandleCopy([file.id]);
    }
    onClose();
  };

  const handleCut = () => {
    if (selectedIds.length > 0) {
      hookHandleCut();
    } else if (file) {
      hookHandleCut([file.id]);
    }
    onClose();
  };

  const handlePaste = async () => {
    await hookHandlePaste();
    onClose();
  };

  const handleRestore = async () => {
    onClose();
    const ids = selectedIds.length > 0 ? selectedIds : file ? [file.id] : [];
    if (ids.length === 0) return;

    try {
      if (setDialogState) {
        setDialogState({
          isVisible: true,
          title: "Restoring...",
          message: "Moving items back to their original locations.",
          type: "alert",
        });
      }
      await Promise.all(ids.map((id) => fileService.restoreItem(id)));
      if (onRefresh) await onRefresh(currentFolder);
      if (setDialogState) setDialogState({ isVisible: false } as any);
    } catch (err) {
      console.error("Failed to restore items:", err);
      alert("Failed to restore some items.");
    }
  };

  const currentFolderTreeNode = folderTree.find(
    (f: FolderNode) => f.id === currentFolder,
  );
  const currentFolderItem = fs.find((f: FileType) => f.id === currentFolder);
  const isInTrash =
    (currentFolderItem?.isSystem &&
      (currentFolderItem?.name === "Trash" ||
        currentFolderItem?.name === ".Trash")) ||
    (currentFolderTreeNode?.is_system &&
      currentFolderTreeNode?.filename === ".Trash");

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
        className={`rfm-context-menu ${isMobile ? "is-mobile" : ""}`}
        style={
          isMobile
            ? {}
            : {
              top: y > window.innerHeight - 300 ? "auto" : y,
              bottom:
                y > window.innerHeight - 300
                  ? window.innerHeight - y + 5
                  : "auto",
              left: x,
            }
        }
      >
        {isMobile && (
          <div className="rfm-context-menu-handle-wrapper">
            <div className="rfm-modal-handle" onClick={onClose} />
            <div className="rfm-context-menu-header">
              {selectedIds.length > 1
                ? `${selectedIds.length} items selected`
                : file
                  ? file.name
                  : selectedIds.length === 1
                    ? fs.find((f) => f.id === selectedIds[0])?.name
                    : "Action Menu"}
            </div>
          </div>
        )}
        <div className="rfm-context-menu-body">
          {/* File-specific actions or Bulk actions if multiple selected */}
          {(file || selectedIds.length > 0) && !isTargetTrash && (
            <>
              {(() => {
                const targetFiles =
                  file &&
                    selectedIds.includes(file.id) &&
                    selectedIds.length > 1
                    ? fs.filter((f) => selectedIds.includes(f.id))
                    : file
                      ? [file]
                      : selectedIds.length > 0
                        ? fs.filter((f) => selectedIds.includes(f.id))
                        : [];

                const targetFile =
                  file ||
                  (selectedIds.length === 1
                    ? fs.find((f) => f.id === selectedIds[0])
                    : null);
                const isScanBusy =
                  targetFile &&
                  (targetFile.scanStatus === "pending" ||
                    targetFile.scanStatus === "scanning");

                return (
                  <>
                    {/* Trash specific actions */}
                    {isInTrash && (
                      <>
                        <div
                          className="rfm-context-menu-item font-bold text-blue-500"
                          onClick={handleRestore}
                        >
                          <SvgIcon
                            svgType="home"
                            className="rfm-context-menu-icon"
                          />
                          Restore to original folder
                        </div>
                        <div className="my-1 h-px bg-stone-200 dark:bg-slate-800" />
                      </>
                    )}

                    {!isInTrash && (
                      <>
                        {/* Open (Preview) - Bold */}
                        <div
                          className={`rfm-context-menu-item font-bold ${isScanBusy
                            ? "disabled opacity-50 cursor-not-allowed"
                            : ""
                            }`}
                          onClick={isScanBusy ? undefined : handleOpen}
                        >
                          <SvgIcon
                            svgType="eye"
                            className="rfm-context-menu-icon"
                          />
                          Open (Preview)
                        </div>

                        {/* Edit - Only for editable text files */}
                        {targetFile &&
                          !targetFile.isDir &&
                          isEditableTextFile(
                            targetFile.name,
                            targetFile.mimeType,
                            targetFile.size,
                          ) &&
                          onEdit && (
                            <div
                              className={`rfm-context-menu-item ${isScanBusy
                                ? "disabled opacity-50 cursor-not-allowed"
                                : ""
                                }`}
                              onClick={
                                isScanBusy
                                  ? undefined
                                  : () => triggerAction(() => onEdit(targetFile))
                              }
                            >
                              <SvgIcon
                                svgType="edit"
                                className="rfm-context-menu-icon"
                              />
                              Edit
                            </div>
                          )}
                      </>
                    )}

                    {/* View Meta Data - Only for single file (Shared by BOTH) */}
                    {targetFile && (
                      <div
                        className="rfm-context-menu-item"
                        onClick={handleViewMetadata}
                      >
                        <SvgIcon
                          svgType="info"
                          className="rfm-context-menu-icon"
                        />
                        View Meta Data
                      </div>
                    )}

                    {/* Preview for Trash item (if user insisted on 'view') */}
                    {isInTrash && targetFile && (
                      <div
                        className={`rfm-context-menu-item ${isScanBusy
                          ? "disabled opacity-50 cursor-not-allowed"
                          : ""
                          }`}
                        onClick={isScanBusy ? undefined : handleOpen}
                      >
                        <SvgIcon
                          svgType="eye"
                          className="rfm-context-menu-icon"
                        />
                        View (Preview)
                      </div>
                    )}

                    {!isInTrash && (
                      <>
                        <div className="my-1 h-px bg-stone-200 dark:bg-slate-800" />

                        {/* Rename - Only for single file */}
                        {targetFile && (
                          <div
                            className={`rfm-context-menu-item ${isScanBusy
                              ? "disabled opacity-50 cursor-not-allowed"
                              : ""
                              }`}
                            onClick={isScanBusy ? undefined : handleRename}
                          >
                            <SvgIcon
                              svgType="edit"
                              className="rfm-context-menu-icon"
                            />
                            Rename
                          </div>
                        )}

                        {/* Cut & Paste & Copy */}
                        <div
                          className="rfm-context-menu-item"
                          onClick={handleCut}
                        >
                          <SvgIcon
                            svgType="scissors"
                            className="rfm-context-menu-icon"
                          />
                          Cut{" "}
                          {selectedIds.length > 1
                            ? `(${selectedIds.length} items)`
                            : ""}
                        </div>

                        {clipboardIds.length > 0 &&
                          clipboardSourceFolder !== currentFolder && (
                            <div
                              className="rfm-context-menu-item"
                              onClick={handlePaste}
                            >
                              <SvgIcon
                                svgType="clipboard"
                                className="rfm-context-menu-icon"
                              />
                              Paste ({clipboardIds.length} item
                              {clipboardIds.length > 1 ? "s" : ""})
                            </div>
                          )}

                        <div
                          className="rfm-context-menu-item"
                          onClick={handleCopy}
                        >
                          <SvgIcon
                            svgType="clipboard"
                            className="rfm-context-menu-icon"
                          />
                          Copy{" "}
                          {selectedIds.length > 1
                            ? `(${selectedIds.length} items)`
                            : ""}
                        </div>
                        <div className="my-1 h-px bg-stone-200 dark:bg-slate-800" />

                        {/* Favorites Toggle - For single or multiple selection */}
                        {targetFiles.length > 0 && (
                          <div
                            className="rfm-context-menu-item"
                            onClick={() => {
                              toggleFavorite(targetFiles);
                              onClose();
                            }}
                          >
                            {(() => {
                              const isAllFav =
                                targetFiles.length > 0 &&
                                targetFiles.every((item) =>
                                  favorites.some((f) => f.id === item.id),
                                );
                              return (
                                <>
                                  <SvgIcon
                                    svgType="star"
                                    className={`rfm-context-menu-icon ${isAllFav
                                      ? "fill-yellow-400 text-yellow-500"
                                      : ""
                                      }`}
                                  />
                                  {isAllFav
                                    ? "Remove from Favorites"
                                    : "Add to Favorites"}
                                </>
                              );
                            })()}
                          </div>
                        )}

                        {/* Share */}
                        {targetFile && onShare && (
                          <div
                            className="rfm-context-menu-item"
                            onClick={() =>
                              triggerAction(() => onShare(targetFile))
                            }
                          >
                            <SvgIcon
                              svgType="share"
                              className="rfm-context-menu-icon"
                            />
                            Share
                          </div>
                        )}

                        {/* Access Log */}
                        {targetFile && targetFile.isShared && onViewAccessLog && (
                          <div
                            className="rfm-context-menu-item"
                            onClick={() =>
                              triggerAction(() => onViewAccessLog(targetFile))
                            }
                          >
                            <SvgIcon
                              svgType="log"
                              className="rfm-context-menu-icon"
                            />
                            Access Log
                          </div>
                        )}

                        {/* Download - Allowed for files and folders */}
                        {targetFiles.length > 0 && (
                          <>
                            <div
                              className={`rfm-context-menu-item ${isScanBusy
                                ? "disabled opacity-50 cursor-not-allowed"
                                : ""
                                }`}
                              onClick={isScanBusy ? undefined : handleDownload}
                            >
                              <SvgIcon
                                svgType="download"
                                className="rfm-context-menu-icon"
                              />
                              Download {isScanBusy && "(Checking...)"}
                            </div>
                            <div className="my-1 h-px bg-stone-200 dark:bg-slate-800" />
                          </>
                        )}
                      </>
                    )}

                    {/* Delete (Common but specialized in Trash to mean Permanent) */}
                    <div
                      className="rfm-context-menu-item text-rose-500"
                      onClick={handleDelete}
                    >
                      <SvgIcon
                        svgType="trash"
                        className="rfm-context-menu-icon !fill-rose-500"
                      />
                      {isInTrash ? "Delete Permanently" : "Delete"}{" "}
                      {selectedIds.length > 1
                        ? `(${selectedIds.length} items)`
                        : ""}
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {isTargetTrash && (
            <>
              <div className="rfm-context-menu-item text-rose-500 font-bold" onClick={handleEmptyTrash}>
                <SvgIcon svgType="trash" className="rfm-context-menu-icon !fill-rose-500" />
                Empty Trash
              </div>
              <div className="my-1 h-px bg-stone-200 dark:bg-slate-800" />
              <div className="rfm-context-menu-info px-3 py-1 text-xs opacity-60">
                Items: {stats?.total_items ?? "..."}
              </div>
              <div className="rfm-context-menu-info px-3 py-1 text-xs opacity-60">
                Size: {stats ? formatSize(stats.total_size) : "..."}
              </div>
              <div className="my-1 h-px bg-stone-200 dark:bg-slate-800" />
              <div className="rfm-context-menu-info px-3 py-1 text-xs opacity-60">
                Files: {stats?.file_count ?? "..."} &nbsp;&bull;&nbsp; Folders: {stats?.folder_count ?? "..."}
              </div>
            </>
          )}

          {/* Empty Trash Confirmation Dialog */}
          {showEmptyTrashConfirm && (
            <div
              className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={(e) => { e.stopPropagation(); setShowEmptyTrashConfirm(false); }}
            >
              <div
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/50 p-6 max-w-sm w-full mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0">
                    <SvgIcon svgType="trash" className="w-5 h-5 !fill-rose-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-900 dark:text-white text-base">Empty Trash?</h3>
                    <p className="text-xs text-stone-500 dark:text-slate-400">This action cannot be undone.</p>
                  </div>
                </div>
                {stats && (
                  <div className="mb-4 bg-stone-50 dark:bg-slate-800 rounded-xl p-4 flex flex-col gap-2 border border-stone-200 dark:border-slate-700">
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500 dark:text-slate-400">Total Items</span>
                      <span className="font-semibold text-stone-800 dark:text-white">{stats.total_items}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500 dark:text-slate-400">Total Size</span>
                      <span className="font-semibold text-stone-800 dark:text-white">{formatSize(stats.total_size)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500 dark:text-slate-400">Files</span>
                      <span className="font-medium text-stone-700 dark:text-slate-300">{stats.file_count}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500 dark:text-slate-400">Folders</span>
                      <span className="font-medium text-stone-700 dark:text-slate-300">{stats.folder_count}</span>
                    </div>
                  </div>
                )}
                <p className="text-sm text-stone-600 dark:text-slate-400 mb-5">
                  All <strong className="text-rose-500">{stats?.total_items ?? "all"} item{stats?.total_items !== 1 ? "s" : ""}</strong> will be <strong>permanently deleted</strong> and cannot be recovered.
                </p>
                <div className="flex gap-3">
                  <button
                    className="flex-1 px-4 py-2.5 rounded-xl bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-300 text-sm font-semibold hover:bg-stone-200 dark:hover:bg-slate-700 transition-colors"
                    onClick={() => setShowEmptyTrashConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 active:scale-95 transition-all"
                    onClick={confirmEmptyTrash}
                  >
                    Empty Trash
                  </button>
                </div>
              </div>
            </div>
          )}

          {!isInTrash && !isTargetTrash && (!file || (file && file.isDir)) && (
            <>
              <div className="rfm-border-t my-1 border-stone-200 dark:border-slate-800" />
              <div
                className="rfm-context-menu-item"
                onClick={() => triggerAction(onNewFolder)}
              >
                <SvgIcon svgType="plus" className="rfm-context-menu-icon" />
                New Folder
              </div>
              <div
                className="rfm-context-menu-item"
                onClick={() => triggerAction(onNewTextFile)}
              >
                <SvgIcon svgType="edit" className="rfm-context-menu-icon" />
                New Text File
              </div>
              <div
                className="rfm-context-menu-item"
                onClick={() => triggerAction(onUpload)}
              >
                <SvgIcon svgType="upload" className="rfm-context-menu-icon" />
                Upload Files
              </div>
            </>
          )}

          {!isInTrash &&
            !isTargetTrash &&
            clipboardIds.length > 0 &&
            clipboardSourceFolder !== currentFolder && (
              <div className="rfm-context-menu-item" onClick={handlePaste}>
                <SvgIcon
                  svgType="clipboard"
                  className="rfm-context-menu-icon"
                />
                Paste ({clipboardIds.length} item
                {clipboardIds.length > 1 ? "s" : ""})
              </div>
            )}
        </div>
      </div>
    </>
  );
};

export default ContextMenu;
