import React, { useState } from "react";
import { useFileManager } from "../context";
import SvgIcon from "./SvgIcon";

const UploadProgressToast = () => {
    const { activeUploads, setActiveUploads } = useFileManager();
    const [isMinimized, setIsMinimized] = useState(false);

    if (activeUploads.length === 0) return null;

    const completed = activeUploads.filter(u => u.status === 'completed').length;
    const total = activeUploads.length;
    const uploading = activeUploads.filter(u => u.status === 'uploading').length;
    const errors = activeUploads.filter(u => u.status === 'error').length;

    return (
        <div className={`rfm-upload-toast ${isMinimized ? "rfm-upload-toast--minimized" : ""}`} style={{ width: '380px', border: '2px solid #6366f1' }}>
            <div className="rfm-upload-toast-header" style={{ padding: '12px 16px' }}>
                <div className="flex flex-col">
                    <span className="rfm-upload-toast-title" style={{ fontSize: '15px' }}>
                        {uploading > 0 ? `Uploading ${total} items` : `Finished ${total} items`}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {completed} of {total} completed{errors > 0 ? `, ${errors} failed` : ''}
                    </span>
                </div>
                <div className="rfm-upload-toast-actions">
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="rfm-upload-toast-btn p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                        title={isMinimized ? "Expand" : "Minimize"}
                    >
                        <SvgIcon svgType={isMinimized ? "arrow-up" : "arrow-down"} className="w-5 h-5" />
                    </button>
                    {uploading === 0 && (
                        <button
                            onClick={() => setActiveUploads([])}
                            className="rfm-upload-toast-btn p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Clear all"
                        >
                            <SvgIcon svgType="close" className="w-5 h-5 text-[#800000] dark:text-[#f87171] !fill-current" />
                        </button>
                    )}
                </div>
            </div>
            {!isMinimized && (
                <div className="rfm-upload-toast-body" style={{ padding: '0 8px 8px 8px' }}>
                    <div className="rfm-upload-list" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                        {activeUploads.map((u) => (
                            <div key={u.id} className="rfm-upload-item" style={{ border: 'none', background: 'transparent', padding: '10px 8px', alignItems: 'flex-start' }}>
                                <div className="rfm-upload-item-icon mt-0.5">
                                    <SvgIcon
                                        svgType={u.status === 'completed' ? 'check' : (u.status === 'error' ? 'close' : 'file')}
                                        className={`w-5 h-5 ${u.status === 'completed' ? 'text-emerald-500' : (u.status === 'error' ? 'text-amber-500' : 'text-slate-400')}`}
                                    />
                                </div>
                                <div className="rfm-upload-item-info">
                                    <div className="flex flex-col">
                                        <div className="flex justify-between items-center gap-2">
                                            <span className="rfm-upload-item-name text-sm" style={{ fontWeight: 500 }} title={u.name}>{u.name}</span>
                                            {u.status === 'uploading' && (
                                                <span className="text-[10px] font-bold text-indigo-500 shrink-0">{Math.round(u.progress)}%</span>
                                            )}
                                        </div>
                                        {u.status === 'error' && u.error && (
                                            <span className="text-[10px] text-rose-500 font-medium mt-0.5 leading-tight">
                                                {u.error}
                                            </span>
                                        )}
                                    </div>
                                    {u.status === 'uploading' && (
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
