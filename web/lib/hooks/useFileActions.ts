import { useCallback } from "react";
import { useFileManager } from "../context";
import { FileType } from "../types";
import { fileService } from "../../src/services/fileService";

export const useFileActions = () => {
  const {
    selectedIds,
    setSelectedIds,
    clipboardIds,
    setClipboardIds,
    isCut,
    setIsCut,
    currentFolder,
    onMove,
    onBulkMove,
    onBulkCopy,
    onDelete,
    onBulkDelete,
    onRefresh,
    setClipboardSourceFolder,
    setDialogState,
    setShareFile,
    setShareModalVisible,
    isZipping,
    setIsZipping,
    setPinModalVisible,
    setPinModalTitle,
    setPinModalMode,
    setPinModalOnConfirm,
    refreshFolderTree,
    fs,
  } = useFileManager();

  const handleCopy = useCallback(
    (targetIds?: string[]) => {
      const ids = targetIds && targetIds.length > 0 ? targetIds : selectedIds;
      if (ids.length === 0) return;

      setClipboardIds(ids);
      setIsCut(false);
      setClipboardSourceFolder(currentFolder);

      // Only clear selection if we are copying specific targets (context menu on single item not in selection)
      // usage pattern dictates usually we clear selection after action to avoid confusion
      setSelectedIds([]);

      if (navigator.vibrate) navigator.vibrate(50);
    },
    [
      selectedIds,
      currentFolder,
      setClipboardIds,
      setIsCut,
      setClipboardSourceFolder,
      setSelectedIds,
    ],
  );

  const handleCut = useCallback(
    (targetIds?: string[]) => {
      const ids = targetIds && targetIds.length > 0 ? targetIds : selectedIds;
      if (ids.length === 0) return;

      setClipboardIds(ids);
      setIsCut(true);
      setClipboardSourceFolder(currentFolder);
      setSelectedIds([]);

      if (navigator.vibrate) navigator.vibrate(50);
    },
    [
      selectedIds,
      currentFolder,
      setClipboardIds,
      setIsCut,
      setClipboardSourceFolder,
      setSelectedIds,
    ],
  );

  const handlePaste = useCallback(async () => {
    if (clipboardIds.length === 0) return;

    try {
      if (isCut) {
        const targetFiles = clipboardIds.map(id => (fs as FileType[]).find(f => f.id === id)).filter(Boolean) as FileType[];
        const lockedItems = targetFiles.filter(f => f.isLocked);

        if (lockedItems.length > 0) {
          setDialogState({
            isVisible: true,
            title: "Move Protection",
            message: `Some items in your clipboard are locked and cannot be moved directly.`,
            type: "confirm",
            lockedItems,
            confirmLabel: "Move Anyway",
            cancelLabel: "Acknowledge",
            onAcknowledge: async () => {
              // Proceed with only unlocked ones
              const unlockedIds = targetFiles.filter(f => !f.isLocked).map(f => f.id);
              if (unlockedIds.length > 0) {
                try {
                  if (onBulkMove) await onBulkMove(unlockedIds, currentFolder);
                  else {
                    for (const id of unlockedIds) await onMove?.(id, currentFolder);
                  }
                } catch (e) { console.error(e); }
              }
              setClipboardIds([]);
              setIsCut(false);
              if (onRefresh) await onRefresh(currentFolder);
            },
            onConfirm: () => {
              setPinModalTitle("Verify PIN to Move Locked Items");
              setPinModalMode("bulk_unlock");
              setPinModalOnConfirm(() => async (pin: string) => {
                try {
                  for (const item of lockedItems) {
                    await fileService.unlockItem(item.id, pin);
                  }
                  if (onBulkMove) await onBulkMove(clipboardIds, currentFolder);
                  else {
                    for (const id of clipboardIds) await onMove?.(id, currentFolder);
                  }
                  setClipboardIds([]);
                  setIsCut(false);
                  if (onRefresh) await onRefresh(currentFolder);
                } catch (err: any) {
                  alert(err.message || "Action failed");
                }
              });
              setPinModalVisible(true);
            }
          });
          return;
        }

        if (onBulkMove) {
          await onBulkMove(clipboardIds, currentFolder);
        } else if (onMove) {
          for (const id of clipboardIds) {
            await onMove(id, currentFolder);
          }
        }
      } else {
        if (onBulkCopy) {
          await onBulkCopy(clipboardIds, currentFolder);
        }
      }
    } catch (error) {
      console.error("Paste failed", error);
    } finally {
      setClipboardIds([]);
      setIsCut(false);
      setClipboardSourceFolder(null);
      if (onRefresh) await onRefresh(currentFolder);
    }
  }, [
    clipboardIds,
    isCut,
    currentFolder,
    onBulkMove,
    onMove,
    onBulkCopy,
    setClipboardIds,
    setIsCut,
    setClipboardSourceFolder,
    onRefresh,
    fs,
    setDialogState,
    setPinModalVisible,
    setPinModalTitle,
    setPinModalMode,
    setPinModalOnConfirm,
  ]);

  const handleDelete = useCallback(
    (targetIds?: string[], targetName?: string) => {
      const ids = targetIds && targetIds.length > 0 ? targetIds : selectedIds;
      if (ids.length === 0) return;

      const count = ids.length;
      const name = targetName || (count === 1 ? "this item" : `${count} items`);

      const targetFiles = ids.map(id => (fs as FileType[]).find(f => f.id === id)).filter(Boolean) as FileType[];
      const lockedItems = targetFiles.filter(f => f.isLocked);
      const unlockedIds = targetFiles.filter(f => !f.isLocked).map(f => f.id);

      if (lockedItems.length > 0) {
        setDialogState({
          isVisible: true,
          title: "Delete Protection",
          message: `The following items are locked. You cannot delete them directly.`,
          type: "confirm",
          lockedItems,
          confirmLabel: "Delete Anyway",
          cancelLabel: "Acknowledge",
          onAcknowledge: async () => {
            if (unlockedIds.length > 0) {
              try {
                if (onBulkDelete) await onBulkDelete(unlockedIds);
                else {
                  for (const id of unlockedIds) await onDelete?.(id);
                }
                if (onRefresh) await onRefresh(currentFolder);
              } catch (e) { console.error(e); }
            }
            setSelectedIds([]);
          },
          onConfirm: () => {
            setPinModalTitle("Verify PIN to Delete Locked Items");
            setPinModalMode("bulk_unlock");
            setPinModalOnConfirm(() => async (pin: string) => {
              try {
                // Frontend should probably unlock them first or backend should handle PIN.
                // User said "continue action on correct pin". 
                // Since bulkDelete doesn't take a PIN, we must unlock them first.
                for (const item of lockedItems) {
                  await fileService.unlockItem(item.id, pin);
                }
                if (onBulkDelete) await onBulkDelete(ids);
                else {
                  for (const id of ids) await onDelete?.(id);
                }
                setSelectedIds([]);
                if (onRefresh) await onRefresh(currentFolder);
              } catch (err: any) {
                alert(err.message || "Action failed");
              }
            });
            setPinModalVisible(true);
          }
        });
        return;
      }

      setDialogState({
        isVisible: true,
        title: "Confirm Delete",
        message: `Are you sure you want to delete ${name}?`,
        type: "confirm",
        onConfirm: async () => {
          try {
            if (onBulkDelete) {
              await onBulkDelete(ids);
            } else if (onDelete) {
              for (const id of ids) {
                await onDelete(id);
              }
            }
            setSelectedIds([]);
            if (onRefresh) await onRefresh(currentFolder);
          } catch (error) {
            console.error("Delete failed", error);
          }
        },
      });
    },
    [
      selectedIds,
      currentFolder,
      setDialogState,
      onBulkDelete,
      onDelete,
      setSelectedIds,
      onRefresh,
      fs,
      setPinModalVisible,
      setPinModalTitle,
      setPinModalMode,
      setPinModalOnConfirm,
    ],
  );

  const handleShare = useCallback(
    (file: FileType) => {
      setShareFile(file);
      setShareModalVisible(true);
    },
    [setShareFile, setShareModalVisible],
  );

  const handleBulkDownload = useCallback(
    async (targetIds?: string[], targetFile?: FileType) => {
      const ids = targetIds && targetIds.length > 0 ? targetIds : selectedIds;
      if (ids.length === 0) return;

      if (isZipping) {
        alert("A ZIP archive is already being prepared. Please wait.");
        return;
      }

      setIsZipping(true);
      try {
        const res = await fileService.bulkDownload(ids);

        const archiveId = res.archive_id;
        let isReady = false;

        while (!isReady) {
          const statusRes = await fileService.getArchiveStatus(archiveId);
          if (statusRes.status === "ready") {
            isReady = true;
            if (statusRes.url) {
              const url = new URL(statusRes.url, window.location.origin);
              const form = document.createElement("form");
              form.method = "POST";
              form.action = url.toString();
              form.style.display = "none";
              document.body.appendChild(form);
              form.submit();
              document.body.removeChild(form);
            }
          } else if (statusRes.status === "failed") {
            alert(`Preparation failed: ${statusRes.error_message || "Unknown error"}`);
            break;
          } else {
            // wait 2 seconds before polling again
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      } catch (err: any) {
        console.error("Bulk download error:", err);
        alert(err.message || "Failed to start bulk download");
      } finally {
        setIsZipping(false);
        setSelectedIds([]);
      }
    },
    [selectedIds, isZipping, setIsZipping, setSelectedIds],
  );

  return {
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleShare,
    handleBulkDownload,
  };
};
