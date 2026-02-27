import React, { useState, useEffect, useCallback } from "react";
import CommonModal from "./CommonModal";
import type { ShareLink, ShareAccessLog } from "../../types";

interface ShareAccessLogModalProps {
  isVisible: boolean;
  file: { id: string; name: string } | null;
  onClose: () => void;
  onListShares: (fileId: string) => Promise<ShareLink[]>;
  onGetLogs: (shareId: string) => Promise<ShareAccessLog[]>;
  clickPosition?: { x: number; y: number } | null;
}

const ShareAccessLogModal: React.FC<ShareAccessLogModalProps> = ({
  isVisible,
  file,
  onClose,
  onListShares,
  onGetLogs,
  clickPosition,
}) => {
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [selectedShareId, setSelectedShareId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ShareAccessLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isVisible && file) {
      setLoading(true);
      onListShares(file.id)
        .then((s) => {
          setShares(s);
          if (s.length > 0 && s[0]) {
            setSelectedShareId(s[0].id);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isVisible, file, onListShares]);

  useEffect(() => {
    if (selectedShareId) {
      setLoading(true);
      onGetLogs(selectedShareId)
        .then(setLogs)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [selectedShareId, onGetLogs]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const actionLabel = (action: string) => {
    switch (action) {
      case "view":
        return "Viewed";
      case "download":
        return "Downloaded";
      case "password_verified":
        return "Password OK";
      case "password_attempt":
        return "Wrong Password";
      default:
        return action;
    }
  };

  const actionColor = (action: string) => {
    switch (action) {
      case "view":
        return "#0ea5e9";
      case "download":
        return "#10b981";
      case "password_verified":
        return "#8b5cf6";
      case "password_attempt":
        return "#f43f5e";
      default:
        return "#94a3b8";
    }
  };

  if (!file) return null;

  return (
    <CommonModal
      title={`Access Log – ${file.name}`}
      isVisible={isVisible}
      onClose={onClose}
      clickPosition={clickPosition}
      autoHeight
      className="rfm-share-modal-container"
    >
      <div className="rfm-access-log-modal">
        {shares.length > 1 && (
          <div className="rfm-access-log-tabs">
            {shares.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`rfm-access-log-tab ${selectedShareId === s.id ? "active" : ""}`}
                onClick={() => setSelectedShareId(s.id)}
              >
                Link #{i + 1}
                <span className="rfm-access-log-tab-badge">{s.permission}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="rfm-access-log-loading">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="rfm-access-log-empty">
            No access logs yet for this share.
          </div>
        ) : (
          <div className="rfm-access-log-list">
            {logs.map((log) => (
              <div key={log.id} className="rfm-access-log-item">
                <div
                  className="rfm-access-log-action-dot"
                  style={{ backgroundColor: actionColor(log.action) }}
                />
                <div className="rfm-access-log-item-content">
                  <div className="rfm-access-log-item-top">
                    <span
                      className="rfm-access-log-action"
                      style={{ color: actionColor(log.action) }}
                    >
                      {actionLabel(log.action)}
                    </span>
                    <span className="rfm-access-log-time">
                      {formatDate(log.accessed_at)}
                    </span>
                  </div>
                  <div className="rfm-access-log-item-bottom">
                    {log.ip_address && (
                      <span className="rfm-access-log-ip">
                        {log.ip_address}
                      </span>
                    )}
                    {log.user_agent && (
                      <span
                        className="rfm-access-log-ua"
                        title={log.user_agent}
                      >
                        {log.user_agent.substring(0, 50)}
                        {log.user_agent.length > 50 ? "…" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CommonModal>
  );
};

export default ShareAccessLogModal;
