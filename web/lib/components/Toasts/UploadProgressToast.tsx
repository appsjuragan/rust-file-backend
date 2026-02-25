import React, { useState, useEffect, useRef } from "react";
import { useFileManager } from "../../context";
import SvgIcon from "../Icons/SvgIcon";

const UploadProgressToast = () => {
  const { activeUploads, setActiveUploads, onCancelUpload, resetSignal } =
    useFileManager();
  const [isMinimized, setIsMinimized] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const completed = activeUploads.filter(
    (u) => u.status === "completed"
  ).length;
  const total = activeUploads.length;
  const uploading = activeUploads.filter(
    (u) =>
      u.status === "uploading" ||
      u.status === "hashing" ||
      u.status === "processing" ||
      u.status === "queued"
  ).length;
  const errors = activeUploads.filter((u) => u.status === "error").length;

  // Determine upload result status
  const isFinished = total > 0 && uploading === 0;

  // Reset countdown when resetSignal changes
  useEffect(() => {
    if (isFinished && showCountdown && autoCloseTimerRef.current) {
      // Only reset the auto-close timer, not the countdown number
      // This keeps the circle animating smoothly
      clearTimeout(autoCloseTimerRef.current);

      // Calculate remaining time based on current countdown
      const remainingMs = (countdown || 0) * 1000;

      autoCloseTimerRef.current = setTimeout(() => {
        setActiveUploads([]);
        setShowCountdown(false);
        setCountdown(null);
      }, Math.max(remainingMs, 5000)); // Reset to at least 5 seconds
    }
  }, [resetSignal, isFinished, showCountdown, countdown, setActiveUploads]);

  // Determine upload result status
  // Auto-close logic
  // Auto-close logic
  useEffect(() => {
    if (isFinished) {
      setShowCountdown(true);
      setCountdown(5);

      // Clear any existing timers just in case
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);

      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 0) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      autoCloseTimerRef.current = setTimeout(() => {
        setActiveUploads([]);
        setShowCountdown(false);
        setCountdown(null);
      }, 5000);
    } else {
      // Stop countdown if no longer finished (e.g. retrying)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      setShowCountdown(false);
      setCountdown(null);
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, [isFinished, setActiveUploads]);

  // Early return AFTER all hooks
  if (activeUploads.length === 0) return null;

  const handleClose = async () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);

    // Abort all remaining uploads when clearing if they have an uploadId and aren't completed
    if (onCancelUpload) {
      for (const u of activeUploads) {
        if (u.status !== "completed") {
          await onCancelUpload(u.id);
        }
      }
    }

    setActiveUploads([]);
    setShowCountdown(false);
    setCountdown(null);
  };

  const allFailed = isFinished && errors === total;
  const partialSuccess = isFinished && errors > 0 && completed > 0;

  // Determine status icon and color
  let statusIcon: "check" | "close" | "alert-triangle" = "check";
  let statusColor = "#10b981"; // green
  let borderColor = "#10b981";

  if (allFailed) {
    statusIcon = "close";
    statusColor = "#ef4444"; // red
    borderColor = "#ef4444";
  } else if (partialSuccess) {
    statusIcon = "alert-triangle";
    statusColor = "#f59e0b"; // yellow/amber
    borderColor = "#f59e0b";
  }

  const averageProgress =
    total > 0
      ? Math.round(
          activeUploads.reduce((acc, u) => acc + (u.progress || 0), 0) / total
        )
      : 0;

  // Calculate progress for circular countdown (shrinking from 100% to 0%)
  const progressPercentage = countdown !== null ? (countdown / 5) * 100 : 0;

  return (
    <div
      className={`rfm-upload-toast ${
        isMinimized ? "rfm-upload-toast--minimized" : ""
      }`}
      style={{
        width: "400px",
        border: `2px solid ${isFinished ? borderColor : "#6366f1"}`,
        borderRadius: "16px",
      }}
    >
      <div
        className="rfm-upload-toast-header"
        style={{
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "between",
          background: "transparent",
          border: "none",
        }}
      >
        <div className="flex flex-col gap-1">
          <span
            className="rfm-upload-toast-title"
            style={{ fontSize: "16px", fontWeight: "600" }}
          >
            {uploading > 0
              ? `Uploading ${total} items`
              : `Finished ${total} items`}
          </span>
          <span className="text-[12px] opacity-70">
            {completed} of {total} completed{" "}
            {uploading > 0 ? `(${averageProgress}%)` : ""}{" "}
            {errors > 0 ? `, ${errors} failed` : ""}
          </span>
        </div>
        <div
          className="rfm-upload-toast-actions"
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            <SvgIcon
              svgType={isMinimized ? "square" : "minus"}
              className="w-4 h-4"
            />
          </button>
          {showCountdown && countdown !== null ? (
            <button
              onClick={handleClose}
              className="relative"
              style={{ width: "40px", height: "40px" }}
              title="Close"
            >
              {/* Circular progress background */}
              <svg
                className="absolute top-0 left-0"
                width="40"
                height="40"
                style={{ transform: "rotate(-90deg)" }}
              >
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="3"
                />
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  fill="none"
                  stroke={statusColor}
                  strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 16}`}
                  strokeDashoffset={`${
                    2 * Math.PI * 16 * (1 - progressPercentage / 100)
                  }`}
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              {/* Status icon in center */}
              <div className="absolute inset-0 flex items-center justify-center">
                <SvgIcon
                  svgType={statusIcon}
                  className="w-5 h-5"
                  style={{ color: statusColor }}
                />
              </div>
            </button>
          ) : uploading === 0 ? (
            <button
              onClick={handleClose}
              className="rfm-upload-toast-btn p-2 hover:bg-red-500/20 rounded-full transition-colors"
              title="Clear all"
            >
              <SvgIcon
                svgType="close"
                className="w-5 h-5 text-red-400 !fill-current"
              />
            </button>
          ) : null}
        </div>
      </div>
      {!isMinimized && (
        <div
          className="rfm-upload-toast-body"
          style={{ padding: "0 24px 20px 24px" }}
        >
          <div
            className="rfm-upload-list"
            style={{ maxHeight: "350px", overflowY: "auto" }}
          >
            {activeUploads.map((u) => (
              <div
                key={u.id}
                className="rfm-upload-item"
                style={{
                  border: "none",
                  background: "transparent",
                  padding: "12px 0",
                  alignItems: "flex-start",
                }}
              >
                <div className="rfm-upload-item-icon mt-0.5">
                  <SvgIcon
                    svgType={
                      u.status === "completed"
                        ? "check"
                        : u.status === "error"
                        ? "close"
                        : u.status === "hashing"
                        ? "loading"
                        : "file"
                    }
                    className={`w-5 h-5 ${
                      u.status === "completed"
                        ? "text-emerald-500"
                        : u.status === "error"
                        ? "text-amber-500"
                        : u.status === "hashing"
                        ? "text-indigo-400 animate-spin"
                        : "text-slate-400"
                    }`}
                  />
                </div>
                <div className="rfm-upload-item-info">
                  <div className="flex flex-col">
                    <div className="flex justify-between items-center gap-2">
                      <span
                        className="rfm-upload-item-name text-sm"
                        style={{ fontWeight: 500 }}
                        title={u.name}
                      >
                        {u.name}
                      </span>
                      {u.status === "uploading" && (
                        <span className="text-[10px] font-bold text-indigo-500 shrink-0">
                          {Math.round(u.progress)}%
                        </span>
                      )}
                      {u.status === "hashing" && (
                        <div className="flex items-center text-indigo-400">
                          <span className="text-[8px] font-bold lowercase tracking-wider">
                            hashing...
                          </span>
                        </div>
                      )}
                      {u.status === "processing" && (
                        <span className="text-[10px] font-bold text-amber-500 shrink-0 animate-pulse">
                          Processing...
                        </span>
                      )}
                    </div>
                    {(u.status === "error" ||
                      (u.status === "completed" && u.error)) &&
                      u.error && (
                        <span
                          className={`text-[10px] font-medium mt-0.5 leading-tight ${
                            u.status === "error"
                              ? "text-rose-500"
                              : "text-emerald-600"
                          }`}
                        >
                          {u.error}
                        </span>
                      )}
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    {u.status !== "completed" && (
                      <button
                        onClick={() => onCancelUpload?.(u.id)}
                        className="p-1.5 hover:bg-slate-700/50 rounded-md transition-colors text-slate-500 hover:text-rose-400"
                        title="Cancel"
                      >
                        <SvgIcon
                          svgType="close"
                          className="w-3.5 h-3.5 !fill-current"
                        />
                      </button>
                    )}
                  </div>
                  {u.status === "uploading" && (
                    <div className="rfm-upload-item-progress-container">
                      <div
                        className="rfm-upload-item-progress-bar"
                        style={{ width: `${u.progress}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadProgressToast;
