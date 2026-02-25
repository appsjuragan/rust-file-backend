import React, { useState } from "react";
import CommonModal from "./CommonModal";
import SvgIcon from "../Icons/SvgIcon";

interface NewTextFileModalProps {
  isVisible: boolean;
  onClose: () => void;
  onCreate: (fileName: string, content: string) => Promise<void>;
  clickPosition?: { x: number; y: number } | null;
}

const NewTextFileModal: React.FC<NewTextFileModalProps> = ({
  isVisible,
  onClose,
  onCreate,
  clickPosition,
}) => {
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) return;

    setLoading(true);
    try {
      const fullFileName = fileName.endsWith(".txt")
        ? fileName
        : `${fileName}.txt`;
      await onCreate(fullFileName, content);
      setFileName("");
      setContent("");
      onClose();
    } catch (err) {
      console.error("Failed to create file:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <CommonModal
      isVisible={isVisible}
      onClose={onClose}
      title="Create New Text File"
      autoHeight={false}
      className="rfm-new-file-modal"
      clickPosition={clickPosition}
    >
      <form
        onSubmit={handleSubmit}
        className="rfm-new-folder-modal-form h-full flex flex-col pt-2"
      >
        <div className="rfm-form-group mb-4">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 block">
            File Name
          </label>
          <input
            autoFocus
            type="text"
            className="rfm-new-folder-modal-input"
            placeholder="e.g. notes.txt"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
          />
        </div>

        <div className="rfm-form-group flex-1 flex flex-col min-h-0">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1 block">
            Content
          </label>
          <textarea
            className="flex-1 w-full bg-stone-50 border border-stone-200 text-stone-900 text-sm rounded-xl p-4 focus:ring-teal-500 focus:border-teal-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 outline-none resize-none font-mono"
            placeholder="Type your content here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="rfm-new-folder-modal-btn mt-6"
          disabled={loading || !fileName.trim()}
        >
          {loading ? "Creating..." : "Create File"}
        </button>
      </form>
    </CommonModal>
  );
};

export default NewTextFileModal;
