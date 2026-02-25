import React, { useState, useEffect } from "react";
import CommonModal from "./CommonModal";

interface IRenameModalProps {
  isVisible: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  currentName: string;
  clickPosition?: { x: number; y: number } | null;
}

const RenameModal: React.FC<IRenameModalProps> = ({
  isVisible,
  onClose,
  onRename,
  currentName,
  clickPosition,
}) => {
  const [newName, setNewName] = useState(currentName);

  useEffect(() => {
    setNewName(currentName);
  }, [currentName, isVisible]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && newName !== currentName) {
      onRename(newName.trim());
    }
    onClose();
  };

  return (
    <CommonModal
      isVisible={isVisible}
      onClose={onClose}
      title="Rename Item"
      autoHeight
      clickPosition={clickPosition}
    >
      <form onSubmit={handleSubmit} className="rfm-new-folder-modal-form">
        <input
          type="text"
          className="rfm-new-folder-modal-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
          placeholder="Enter new name"
        />
        <button type="submit" className="rfm-new-folder-modal-btn">
          Rename
        </button>
      </form>
    </CommonModal>
  );
};

export default RenameModal;
