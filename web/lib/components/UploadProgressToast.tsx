import React, { useState } from "react";
import { useFileManager } from "../context";
import SvgIcon from "./SvgIcon";

const UploadProgressToast = () => {
    const { isUploading, uploadProgress, uploadFileName, setIsUploading } = useFileManager();
    const [isMinimized, setIsMinimized] = useState(false);

    if (!isUploading) return null;

    return (
        <div className={`rfm-upload-toast ${isMinimized ? "rfm-upload-toast--minimized" : ""}`}>
            <div className="rfm-upload-toast-header">
                <span className="rfm-upload-toast-title">
                    {uploadProgress === 100 ? "Processing..." : `Uploading ${uploadFileName}`}
                </span>
                <div className="rfm-upload-toast-actions">
                    <button onClick={() => setIsMinimized(!isMinimized)} className="rfm-upload-toast-btn">
                        <SvgIcon svgType={isMinimized ? "arrow-up" : "arrow-down"} className="w-4 h-4" />
                    </button>
                    {uploadProgress === 100 && (
                        <button onClick={() => setIsUploading(false)} className="rfm-upload-toast-btn">
                            <SvgIcon svgType="close" className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            {!isMinimized && (
                <div className="rfm-upload-toast-body">
                    <div className="rfm-upload-progress-container">
                        <div
                            className="rfm-upload-progress-bar"
                            style={{ width: `${uploadProgress}%` }}
                        ></div>
                    </div>
                    <span className="rfm-upload-progress-text">{uploadProgress}%</span>
                </div>
            )}
        </div>
    );
};

export default UploadProgressToast;
