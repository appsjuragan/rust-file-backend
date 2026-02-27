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
}: UseWorkspaceKeyboardOptions) {
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
        if (selectedIds.length > 0) {
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
        if (selectedIds.length > 0) {
          setClipboardIds(selectedIds);
          setIsCut(false);
          setClipboardSourceFolder(currentFolder);
        }
      }

      if (e.key === "x" && (e.ctrlKey || e.metaKey)) {
        if (selectedIds.length > 0) {
          setClipboardIds(selectedIds);
          setIsCut(true);
          setClipboardSourceFolder(currentFolder);
        }
      }

      if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
        handlePaste();
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
    ],
  );

  return { handleKeyDown };
}
