import React, { useEffect, useRef } from "react";
import { useFileManager } from "../../context";
import { FileType } from "../../types";
import SvgIcon from "../Icons/SvgIcon";
import { fileService } from "../../../src/services/fileService";
import { useFileActions } from "../../hooks/useFileActions";
import { useMediaQuery } from "../../hooks/useMediaQuery";

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
  onNewFolder,
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
  } = useFileManager();

  const {
    handleCopy: hookHandleCopy,
    handleCut: hookHandleCut,
    handleDelete: hookHandleDelete,
    handlePaste: hookHandlePaste,
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
    if (file && !file.isDir) {
      try {
        const res = await fileService.getDownloadTicket(file.id);
        const url = res.url; // presigned URL from backend
        const link = document.createElement("a");
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
          {(file || selectedIds.length > 0) && (
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

                    {/* View Meta Data - Only for single file */}
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
                    <div className="rfm-context-menu-item" onClick={handleCut}>
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

                    <div className="rfm-context-menu-item" onClick={handleCopy}>
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
                              favorites.some((f) => f.id === item.id)
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
                    {targetFile &&
                      targetFile.isShared &&
                      onViewAccessLog && (
                        <div
                          className="rfm-context-menu-item"
                          onClick={() =>
                            triggerAction(() =>
                              onViewAccessLog(targetFile)
                            )
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
                    {targetFile && (
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

                    {/* Delete */}
                    <div
                      className="rfm-context-menu-item text-rose-500"
                      onClick={handleDelete}
                    >
                      <SvgIcon
                        svgType="trash"
                        className="rfm-context-menu-icon !fill-rose-500"
                      />
                      Delete{" "}
                      {selectedIds.length > 1
                        ? `(${selectedIds.length} items)`
                        : ""}
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {(!file || (file && file.isDir)) && (
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
                onClick={() => triggerAction(onUpload)}
              >
                <SvgIcon svgType="upload" className="rfm-context-menu-icon" />
                Upload Files
              </div>
            </>
          )}

          {clipboardIds.length > 0 &&
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
