import React from "react";
import { useFileManager } from "../../context";
import CommonModal from "./CommonModal";

const DialogModal = () => {
  const { dialogState, setDialogState } = useFileManager();

  if (!dialogState.isVisible) return null;

  const handleClose = () => {
    if (dialogState.onCancel) dialogState.onCancel();
    setDialogState({ ...dialogState, isVisible: false });
  };

  const handleConfirm = () => {
    if (dialogState.onConfirm) dialogState.onConfirm();
    setDialogState({ ...dialogState, isVisible: false });
  };

  const handleAcknowledge = () => {
    if (dialogState.onAcknowledge) dialogState.onAcknowledge();
    setDialogState({ ...dialogState, isVisible: false });
  };

  return (
    <CommonModal
      title={dialogState.title}
      isVisible={dialogState.isVisible}
      onClose={handleClose}
      autoHeight
      centered
    >
      <div className="rfm-dialog-content max-w-md">
        <p className="rfm-dialog-message mb-4 opacity-80">{dialogState.message}</p>

        {dialogState.lockedItems && dialogState.lockedItems.length > 0 && (
          <div className="rfm-dialog-locked-items bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-lg p-3 mb-4">
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-2">
              Locked Items ({dialogState.lockedItems.length})
            </p>
            <div className="max-h-32 overflow-y-auto rfm-scrollbar pr-1">
              {dialogState.lockedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 py-1 border-b border-rose-100/50 dark:border-rose-900/20 last:border-0">
                  <span className="text-rose-500">🔒</span>
                  <span className="text-sm truncate flex-1">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rfm-dialog-footer flex gap-2 justify-end">
          {dialogState.lockedItems && dialogState.lockedItems.length > 0 ? (
            <>
              <button className="rfm-btn-secondary flex-1" onClick={handleAcknowledge}>
                {dialogState.cancelLabel || "Acknowledge"}
              </button>
              <button className="rfm-btn-danger flex-1" onClick={handleConfirm}>
                {dialogState.confirmLabel || "Delete Anyway"}
              </button>
              <button className="rfm-btn-secondary" onClick={handleClose}>
                Cancel
              </button>
            </>
          ) : (
            <>
              {dialogState.type === "confirm" && (
                <button className="rfm-btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
              )}
              <button className="rfm-btn-primary" onClick={handleConfirm}>
                {dialogState.type === "confirm" ? "Confirm" : "OK"}
              </button>
            </>
          )}
        </div>
      </div>
    </CommonModal>
  );
};

export default DialogModal;
