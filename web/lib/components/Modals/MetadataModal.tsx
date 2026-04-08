import React from "react";
import CommonModal from "./CommonModal";
import { FileType } from "../../types";
import SvgIcon from "../Icons/SvgIcon";

interface IMetadataModalProps {
  isVisible: boolean;
  onClose: () => void;
  file: FileType | null;
  clickPosition?: { x: number; y: number } | null;
}

const MetadataModal: React.FC<IMetadataModalProps> = ({
  isVisible,
  onClose,
  file,
  clickPosition,
}) => {
  if (!file) return null;

  const formatSize = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return "--";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <CommonModal
      isVisible={isVisible}
      onClose={onClose}
      title="File Metadata"
      className="rfm-metadata-modal"
      autoHeight
      clickPosition={clickPosition}
    >
      <div className="rfm-metadata-form">
        <div className="rfm-form-group">
          <label>Name</label>
          <input type="text" value={file.name} readOnly />
        </div>
        <div className="rfm-form-group">
          <label>Size</label>
          <input
            type="text"
            value={file.isDir ? "--" : formatSize(file.size)}
            readOnly
          />
        </div>
        <div className="rfm-form-group">
          <label>Type</label>
          <input
            type="text"
            value={file.isDir ? "Folder" : file.mimeType || "Unknown"}
            readOnly
          />
        </div>
        <div className="rfm-form-group">
          <label>Scan Status</label>
          <div className="mt-1">
            <span
              className={`rfm-status-badge is-${file.scanStatus || "unchecked"
                }`}
            >
              <SvgIcon svgType="shield" className="w-3.5 h-3.5 mr-1" />
              {file.scanStatus || "unchecked"}
            </span>
          </div>
        </div>

        {file.isShared && (
          <div className="rfm-metadata-sharing-section mt-4 pt-4 border-t border-stone-200 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-slate-500 mb-3">
              Sharing Information
            </h4>
            <div className="rfm-form-group">
              <label>Shared By</label>
              <input type="text" value={file.sharedBy || "System"} readOnly />
            </div>
            <div className="rfm-form-group">
              <label>ACL / Permissions</label>
              <input
                type="text"
                value={
                  file.permission === "view"
                    ? "View Only (No Download/Copy)"
                    : "View & Download"
                }
                readOnly
              />
            </div>
            {file.expiresAt && (
              <div className="rfm-form-group">
                <label>Time Left</label>
                <input
                  type="text"
                  value={formatTimeLeft(file.expiresAt)}
                  readOnly
                  className="is-expire-warning"
                />
              </div>
            )}
          </div>
        )}

        {file.extraMetadata && (
          <div className="rfm-form-group">
            <label>Extra Metadata</label>
            <pre className="rfm-metadata-json">
              {JSON.stringify(file.extraMetadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </CommonModal>
  );
};

const formatTimeLeft = (expiresAt: string) => {
  try {
    const expires = new Date(expiresAt).getTime();
    const now = Date.now();
    const diff = expires - now;
    if (diff <= 0) return "Expired";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? "s" : ""} left`;
    }
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  } catch {
    return "N/A";
  }
};

export default MetadataModal;
