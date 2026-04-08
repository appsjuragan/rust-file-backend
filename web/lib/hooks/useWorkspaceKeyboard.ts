import { useCallback } from "react";
import type { FileType } from "../types";

interface UseWorkspaceKeyboardOptions {
  currentFolderFiles: FileType[];
  selectedIds: string[];
  currentFolder: string;
  setSelectedIds: (ids: string[]) => void;
  setContextMenu: (menu: any) => void;
  setDialogState: (state: any) => void;
  setClipboardIds: (ids: string[]) => void;
  setIsCut: (val: boolean) => void;
  setClipboardSourceFolder: (folder: string) => void;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  handlePaste: () => void;
  fs: FileType[];
}

export function useWorkspaceKeyboard({
  currentFolderFiles,
  selectedIds,
  currentFolder,
  setSelectedIds,
  setContextMenu,
  setDialogState,
  setClipboardIds,
  setIsCut,
  setClipboardSourceFolder,
  onBulkDelete,
  onDelete,
  handlePaste,
  fs,
}: UseWorkspaceKeyboardOptions) {
  const isSharedReadOnly =
    currentFolder === "shared-for-you" ||
    fs.some((f) => selectedIds.includes(f.id) && f.isShared) ||
    fs.find((f) => f.id === currentFolder)?.isShared === true;

  const targetFiles = fs.filter((f) => selectedIds.includes(f.id));
  const isViewOnly =
    isSharedReadOnly &&
    (targetFiles.some((f) => f.permission === "view") ||
      fs.find((f) => f.id === currentFolder)?.permission === "view");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;

      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelectedIds(currentFolderFiles.map((f) => f.id));
      }

      if (e.key === "Escape") {
        setSelectedIds([]);
        setContextMenu(null);
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (!isSharedReadOnly && selectedIds.length > 0) {
          setDialogState({
            isVisible: true,
            title: "Confirm Delete",
            message: `Are you sure you want to delete ${selectedIds.length} item(s)?`,
            type: "confirm",
            onConfirm: async () => {
              if (onBulkDelete) {
                await onBulkDelete(selectedIds);
              } else if (onDelete) {
                for (const id of selectedIds) {
                  await onDelete(id);
                }
              }
              setSelectedIds([]);
            },
          });
        }
      }

      if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
        if (isViewOnly) return;
        if (selectedIds.length > 0) {
          setClipboardIds(selectedIds);
          setIsCut(false);
          setClipboardSourceFolder(currentFolder);
        }
      }

      if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        if (isViewOnly) e.preventDefault();
      }

      if (e.key === "x" && (e.ctrlKey || e.metaKey)) {
        if (!isSharedReadOnly && selectedIds.length > 0) {
          setClipboardIds(selectedIds);
          setIsCut(true);
          setClipboardSourceFolder(currentFolder);
        }
      }

      if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
        if (!isSharedReadOnly) {
          handlePaste();
        }
      }
    },
    [
      currentFolderFiles,
      selectedIds,
      onBulkDelete,
      onDelete,
      setSelectedIds,
      setContextMenu,
      setDialogState,
      setClipboardIds,
      setIsCut,
      currentFolder,
      setClipboardSourceFolder,
      handlePaste,
      isSharedReadOnly,
    ],
  );

  return { handleKeyDown };
}
