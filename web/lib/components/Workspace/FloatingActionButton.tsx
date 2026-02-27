import React from "react";
import SvgIcon from "../Icons/SvgIcon";
import type { FileType } from "../../types";

interface FloatingActionButtonProps {
  fabMenuOpen: boolean;
  setFabMenuOpen: (val: boolean) => void;
  onNewFolder: () => void;
  onNewTextFile: () => void;
  onTakePhoto: () => void;
  onUploadFiles: () => void;
  clipboardIds: string[];
  clipboardSourceFolder: string;
  currentFolder: string;
  onPaste: () => void;
  photoInputRef: React.Ref<HTMLInputElement>;
  onUpload?: (
    payload: { file: File; path: string }[],
    folderId: string,
  ) => Promise<void>;
}

const FloatingActionButton = ({
  fabMenuOpen,
  setFabMenuOpen,
  onNewFolder,
  onNewTextFile,
  onTakePhoto,
  onUploadFiles,
  clipboardIds,
  clipboardSourceFolder,
  currentFolder,
  onPaste,
  photoInputRef,
  onUpload,
}: FloatingActionButtonProps) => {
  return (
    <>
      {/* Backdrop for FAB Menu */}
      {fabMenuOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[4500]"
          onClick={() => setFabMenuOpen(false)}
        />
      )}

      <div className={`rfm-fab-menu ${fabMenuOpen ? "active" : ""}`}>
        <div
          className="rfm-fab-item"
          onClick={() => {
            onNewFolder();
            setFabMenuOpen(false);
          }}
        >
          <div className="rfm-fab-action">
            <span className="rfm-fab-action-label">New Folder</span>
            <div className="rfm-fab-action-icon">
              <SvgIcon svgType="folder" />
            </div>
          </div>
        </div>
        <div
          className="rfm-fab-item"
          onClick={() => {
            onNewTextFile();
            setFabMenuOpen(false);
          }}
        >
          <div className="rfm-fab-action">
            <span className="rfm-fab-action-label">New Text File</span>
            <div className="rfm-fab-action-icon">
              <SvgIcon svgType="edit" />
            </div>
          </div>
        </div>
        <div
          className="rfm-fab-item"
          onClick={() => {
            onTakePhoto();
            setFabMenuOpen(false);
          }}
        >
          <div className="rfm-fab-action">
            <span className="rfm-fab-action-label">Take Photo</span>
            <div className="rfm-fab-action-icon">
              <SvgIcon svgType="camera" />
            </div>
          </div>
        </div>
        <div
          className="rfm-fab-item"
          onClick={() => {
            onUploadFiles();
            setFabMenuOpen(false);
          }}
        >
          <div className="rfm-fab-action">
            <span className="rfm-fab-action-label">Upload Files</span>
            <div className="rfm-fab-action-icon">
              <SvgIcon svgType="upload" />
            </div>
          </div>
        </div>
      </div>

      <div
        className={`rfm-fab sm:hidden transition-transform duration-300 ${
          fabMenuOpen ? "rotate-45 bg-rose-500 !shadow-rose-500/30" : ""
        }`}
        onClick={(e) => {
          e.stopPropagation();
          setFabMenuOpen(!fabMenuOpen);
        }}
      >
        <SvgIcon svgType="plus" />
      </div>

      {/* Quick Paste Button for Mobile */}
      {clipboardIds.length > 0 && clipboardSourceFolder !== currentFolder && (
        <div
          className="rfm-fab sm:hidden rfm-fab-paste"
          onClick={(e) => {
            e.stopPropagation();
            onPaste();
          }}
          title={`Paste ${clipboardIds.length} items`}
        >
          <div className="relative">
            <SvgIcon svgType="copy" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
              {clipboardIds.length}
            </span>
          </div>
        </div>
      )}

      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={photoInputRef}
        className="hidden"
        onChange={async (e) => {
          if (e.target.files && e.target.files.length > 0 && onUpload) {
            const file = e.target.files[0];
            if (!file) return;
            const timestamp = new Date().getTime();
            const fileName = `photo_${timestamp}.jpg`;
            const renamedFile = new File([file], fileName, {
              type: file.type,
            });
            await onUpload(
              [{ file: renamedFile, path: fileName }],
              currentFolder,
            );
          }
        }}
      />
    </>
  );
};

export default FloatingActionButton;
