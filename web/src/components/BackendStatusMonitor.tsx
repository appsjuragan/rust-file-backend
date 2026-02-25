import React, { useEffect, useState } from "react";
import { SvgIcon } from "../../lib";
import "./BackendStatus.css";

interface BackendStatusProps {
  onLogout: () => void;
}

export const BackendStatusMonitor: React.FC<BackendStatusProps> = ({
  onLogout,
}) => {
  const [isBackendDown, setIsBackendDown] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const checkBackendHealth = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "/api";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${API_URL}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setIsBackendDown(false);
        setRetryCount(0);
      } else {
        setIsBackendDown(true);
        setRetryCount((prev) => prev + 1);
      }
    } catch (error) {
      setIsBackendDown(true);
      setRetryCount((prev) => prev + 1);
    } finally {
      setLastCheckTime(new Date());
    }
  };

  useEffect(() => {
    // Initial check
    checkBackendHealth();

    // Check every 30 seconds
    const interval = setInterval(checkBackendHealth, 30000);

    return () => clearInterval(interval);
  }, []);

  if (!isBackendDown) return null;

  return (
    <div className="backend-status-overlay">
      <div className="backend-status-modal">
        <div className="backend-status-icon-container">
          <SvgIcon svgType="alert-triangle" className="backend-status-icon" />
        </div>
        <h2 className="backend-status-title">Backend Connection Lost</h2>
        <p className="backend-status-message">
          Unable to connect to the backend server. Please check if the server is
          running.
        </p>
        <div className="backend-status-details">
          <div className="backend-status-detail-item">
            <span className="backend-status-label">Last Check:</span>
            <span className="backend-status-value">
              {lastCheckTime ? lastCheckTime.toLocaleTimeString() : "N/A"}
            </span>
          </div>
          <div className="backend-status-detail-item">
            <span className="backend-status-label">Retry Attempts:</span>
            <span className="backend-status-value">{retryCount}</span>
          </div>
        </div>
        <div className="backend-status-actions">
          <button
            className="backend-status-btn backend-status-btn-primary"
            onClick={checkBackendHealth}
          >
            <SvgIcon svgType="loading" className="w-4 h-4 mr-2" />
            Retry Connection
          </button>
          <button
            className="backend-status-btn backend-status-btn-secondary"
            onClick={onLogout}
          >
            <SvgIcon svgType="close" className="w-4 h-4 mr-2" />
            Logout
          </button>
        </div>
        <p className="backend-status-footer">
          The connection will be automatically retried every 30 seconds.
        </p>
      </div>
    </div>
  );
};
