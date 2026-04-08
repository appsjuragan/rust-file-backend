import React from "react";
import SvgIcon from "../Icons/SvgIcon";
import type { FileType } from "../../types";
import { useFileActions } from "../../hooks/useFileActions";
import { fileService } from "../../../src/services/fileService";

interface SelectionBarProps {
  selectedIds: string[];
  currentFolderFiles: FileType[];
  fs: FileType[];
  currentFolder: string;
  setSelectedIds: (ids: string[]) => void;
  setClipboardIds: (ids: string[]) => void;
  setIsCut: (val: boolean) => void;
  setClipboardSourceFolder: (folder: string) => void;
  setContextMenu: (menu: any) => void;
  setDialogState: (state: any) => void;
  handleShare: (file: FileType) => void;
}

const SelectionBar = ({
  selectedIds,
  currentFolderFiles,
  fs,
  currentFolder,
  setSelectedIds,
  setClipboardIds,
  setIsCut,
  setClipboardSourceFolder,
  setContextMenu,
  setDialogState,
  handleShare,
}: SelectionBarProps) => {
  const { handleBulkDownload } = useFileActions();
  if (selectedIds.length === 0) return null;

  // Read-only mode: user is viewing a file/folder shared with them (not their own)
  const isSharedReadOnly =
    currentFolder === "shared-for-you" ||
    fs.some((f) => selectedIds.includes(f.id) && f.isShared) ||
    fs.find((f) => f.id === currentFolder)?.isShared === true;

  const targetFiles = fs.filter((f) => selectedIds.includes(f.id));
  const isViewOnly =
    isSharedReadOnly &&
    (targetFiles.some((f) => f.permission === "view") ||
      fs.find((f) => f.id === currentFolder)?.permission === "view");

  return (
    <div className="rfm-selection-bar">
      <div
        className="rfm-selection-pill"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const allIds = currentFolderFiles.map((f) => f.id);
          const isAllSelected =
            allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

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

      {!isViewOnly && (
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
      )}

      {!isSharedReadOnly && (
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
      )}

      {!isSharedReadOnly && selectedIds.length === 1 && (
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

      {/* Bulk Download Button */}
      {!isViewOnly && (
        <div
          className="rfm-selection-action-btn"
          onClick={async (e) => {
            e.stopPropagation();
            // Single non-folder file → direct download
            if (selectedIds.length === 1) {
              const singleFile =
                currentFolderFiles.find((f) => f.id === selectedIds[0]) ||
                fs.find((f) => f.id === selectedIds[0]);
              if (singleFile && !singleFile.isDir) {
                try {
                  const res = await fileService.getDownloadTicket(singleFile.id);
                  const link = document.createElement("a");
                  link.href = res.url.includes("?")
                    ? `${res.url}&download=1`
                    : `${res.url}?download=1`;
                  link.download = singleFile.name;
                  link.style.display = "none";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                } catch (err) {
                  console.error("Download failed:", err);
                }
                return;
              }
            }
            handleBulkDownload();
          }}
          title="Download"
        >
          <SvgIcon svgType="download" />
        </div>
      )}

      <div
        className="rfm-selection-action-btn ml-auto"
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
        <SvgIcon svgType="menu" />
      </div>
    </div>
  );
};

export default SelectionBar;
