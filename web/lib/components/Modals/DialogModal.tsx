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

  return (
    <CommonModal
      title={dialogState.title}
      isVisible={dialogState.isVisible}
      onClose={handleClose}
      autoHeight
      centered
    >
      <div className="rfm-dialog-content">
        <p className="rfm-dialog-message">{dialogState.message}</p>
        <div className="rfm-dialog-footer">
          {dialogState.type === "confirm" && (
            <button className="rfm-btn-secondary" onClick={handleClose}>
              Cancel
            </button>
          )}
          <button className="rfm-btn-primary" onClick={handleConfirm}>
            {dialogState.type === "confirm" ? "Confirm" : "OK"}
          </button>
        </div>
      </div>
    </CommonModal>
  );
};

export default DialogModal;
