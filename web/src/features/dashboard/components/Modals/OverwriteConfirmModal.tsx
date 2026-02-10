import React from "react";
import { CommonModal } from "../../../../../lib";
import "./Modals.css";

interface OverwriteConfirmModalProps {
    isVisible: boolean;
    fileName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const OverwriteConfirmModal: React.FC<OverwriteConfirmModalProps> = ({
    isVisible,
    fileName,
    onConfirm,
    onCancel,
}) => {
    return (
        <CommonModal
            isVisible={isVisible}
            title="Confirm Overwrite"
            onClose={onCancel}
            className="rfm-confirm-modal"
        >
            <div className="rfm-confirm-content">
                <p>
                    A file named <strong>{fileName}</strong> already exists in this folder.
                </p>
                <p>Do you want to overwrite it?</p>
                <div className="rfm-modal-actions right">
                    <button className="rfm-btn-secondary" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="rfm-btn-danger" onClick={onConfirm}>
                        Overwrite
                    </button>
                </div>
            </div>
        </CommonModal>
    );
};
