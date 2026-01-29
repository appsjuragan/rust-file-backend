import React, { useState } from "react";
import { useFileManager } from "../context";
import CommonModal from "./CommonModal";

interface INewFolderModalProps {
  isVisible: boolean;
  onClose: () => void;
}

const NewFolderModal = (props: INewFolderModalProps) => {
  const { onCreateFolder } = useFileManager();
  const [name, setName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && onCreateFolder) {
      try {
        await onCreateFolder(name.trim());
        setName("");
        props.onClose();
      } catch (err) {
        console.error("Failed to create folder", err);
      }
    }
  };

  return (
    <CommonModal title="Create New Folder" {...props}>
      <div>
        <form onSubmit={handleSubmit} className="rfm-new-folder-modal-form">
          <div>
            <input
              type="text"
              className="rfm-new-folder-modal-input"
              placeholder="Folder Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button
            disabled={!name.trim()}
            type="submit"
            className="rfm-new-folder-modal-btn"
          >
            Create
          </button>
        </form>
      </div>
    </CommonModal>
  );
};

export default NewFolderModal;
