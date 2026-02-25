import React, { useState, useEffect, useCallback } from "react";
import CommonModal from "./CommonModal";
import SvgIcon from "../Icons/SvgIcon";
import { useFileManager } from "../../context";
import type { FileType, ShareLink } from "../../types";

interface ShareModalProps {
    isVisible: boolean;
    file: FileType | null;
    onClose: () => void;
    onCreateShare: (params: {
        user_file_id: string;
        share_type: "public" | "user";
        password?: string;
        permission: "view" | "download";
        expires_in_hours: number;
    }) => Promise<ShareLink>;
    onListShares: (fileId: string) => Promise<ShareLink[]>;
    onRevokeShare: (shareId: string) => Promise<void>;
    clickPosition?: { x: number; y: number } | null;
}

const EXPIRY_PRESETS = [
    { label: "1 hour", hours: 1 },
    { label: "24 hours", hours: 24 },
    { label: "7 days", hours: 168 },
    { label: "30 days", hours: 720 },
];

const ShareModal: React.FC<ShareModalProps> = ({
    isVisible,
    file,
    onClose,
    onCreateShare,
    onListShares,
    onRevokeShare,
    clickPosition,
}) => {
    const [permission, setPermission] = useState<"view" | "download">("view");
    const [password, setPassword] = useState("");
    const [usePassword, setUsePassword] = useState(false);
    const [expiryHours, setExpiryHours] = useState(24);
    const [existingShares, setExistingShares] = useState<ShareLink[]>([]);
    const [creating, setCreating] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [newShareToken, setNewShareToken] = useState<string | null>(null);

    const baseUrl = window.location.origin;

    const loadShares = useCallback(async () => {
        if (!file) return;
        try {
            const shares = await onListShares(file.id);
            setExistingShares(shares);
        } catch {
            /* quiet */
        }
    }, [file, onListShares]);

    useEffect(() => {
        if (isVisible && file) {
            loadShares();
            setNewShareToken(null);
            setPassword("");
            setUsePassword(false);
        }
    }, [isVisible, file, loadShares]);

    const handleCreate = async () => {
        if (!file) return;
        setCreating(true);
        try {
            const share = await onCreateShare({
                user_file_id: file.id,
                share_type: "public",
                password: usePassword ? password : undefined,
                permission,
                expires_in_hours: expiryHours,
            });
            setNewShareToken(share.share_token);
            await loadShares();
        } catch {
            /* show error */
        }
        setCreating(false);
    };

    const handleRevoke = async (shareId: string) => {
        try {
            await onRevokeShare(shareId);
            setExistingShares((prev) => prev.filter((s) => s.id !== shareId));
        } catch {
            /* quiet */
        }
    };

    const copyToClipboard = (token: string, id: string) => {
        navigator.clipboard.writeText(`${baseUrl}/s/${token}`);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const formatExpiry = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = d.getTime() - now.getTime();
        if (diffMs <= 0) return "Expired";
        const diffH = Math.floor(diffMs / 3600000);
        if (diffH < 24) return `${diffH}h remaining`;
        const diffD = Math.floor(diffH / 24);
        return `${diffD}d remaining`;
    };

    if (!file) return null;

    return (
        <CommonModal
            title={`Share "${file.name}"`}
            isVisible={isVisible}
            onClose={onClose}
            clickPosition={clickPosition}
            autoHeight
            className="rfm-share-modal-container"
        >
            <div className="rfm-share-modal">
                {/* Create new share */}
                <div className="rfm-share-create-section">
                    <div className="rfm-share-field">
                        <label className="rfm-share-label">Permission</label>
                        <div className="rfm-share-toggle-group">
                            <button
                                type="button"
                                className={`rfm-share-toggle-btn ${permission === "view" ? "active" : ""}`}
                                onClick={() => {
                                    if (permission !== "view") {
                                        setPermission("view");
                                        setNewShareToken(null);
                                        setPassword("");
                                        setUsePassword(false);
                                    }
                                }}
                            >
                                <SvgIcon svgType="eye" size={14} />
                                <span>View Only</span>
                            </button>
                            <button
                                type="button"
                                className={`rfm-share-toggle-btn ${permission === "download" ? "active" : ""}`}
                                onClick={() => {
                                    if (permission !== "download") {
                                        setPermission("download");
                                        setNewShareToken(null);
                                        setPassword("");
                                        setUsePassword(false);
                                    }
                                }}
                            >
                                <SvgIcon svgType="download" size={14} />
                                <span>Download</span>
                            </button>
                        </div>
                    </div>

                    <div className="rfm-share-field">
                        <label className="rfm-share-label">Expires In</label>
                        <div className="rfm-share-expiry-presets">
                            {EXPIRY_PRESETS.map((p) => (
                                <button
                                    key={p.hours}
                                    type="button"
                                    className={`rfm-share-expiry-btn ${expiryHours === p.hours ? "active" : ""}`}
                                    onClick={() => setExpiryHours(p.hours)}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rfm-share-field">
                        <label className="rfm-share-checkbox-label">
                            <div className="rfm-share-checkbox-wrapper">
                                <input
                                    type="checkbox"
                                    checked={usePassword}
                                    onChange={(e) => setUsePassword(e.target.checked)}
                                />
                                <div className="rfm-share-checkbox-custom">
                                    <SvgIcon svgType="check" size={10} />
                                </div>
                            </div>
                            <span>Password protect</span>
                        </label>
                        {usePassword && (
                            <input
                                type="text"
                                className="rfm-share-input"
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ WebkitTextSecurity: 'disc' } as any}
                            />
                        )}
                    </div>

                    <button
                        type="button"
                        className="rfm-share-create-btn"
                        onClick={handleCreate}
                        disabled={creating || (usePassword && !password)}
                    >
                        {creating ? "Creating..." : "Create Share Link"}
                    </button>

                    {newShareToken && (
                        <div className="rfm-share-result">
                            <div className="rfm-share-link-display">
                                <input
                                    readOnly
                                    value={`${baseUrl}/s/${newShareToken}`}
                                    className="rfm-share-link-input"
                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                />
                                <button
                                    type="button"
                                    className="rfm-share-copy-btn"
                                    onClick={() => copyToClipboard(newShareToken, "new")}
                                >
                                    {copiedId === "new" ? "Copied!" : "Copy"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Existing shares */}
                {existingShares.length > 0 && (
                    <div className="rfm-share-existing-section">
                        <div className="rfm-share-section-title">
                            Active Shares ({existingShares.length})
                        </div>
                        <div className="rfm-share-list">
                            {existingShares.map((share) => (
                                <div key={share.id} className="rfm-share-item">
                                    <div className="rfm-share-item-info">
                                        <div className="rfm-share-item-meta">
                                            <span className="rfm-share-badge rfm-share-badge-permission" title={share.permission === "download" ? "Download" : "View Only"}>
                                                <SvgIcon svgType={share.permission === "download" ? "download" : "eye"} size={10} />
                                            </span>
                                            {share.has_password && (
                                                <span className="rfm-share-badge rfm-share-badge-lock">
                                                    <SvgIcon svgType="shield" size={10} />
                                                </span>
                                            )}
                                            <span className="rfm-share-item-expiry">
                                                {formatExpiry(share.expires_at)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="rfm-share-item-actions">
                                        <button
                                            type="button"
                                            className="rfm-share-action-btn"
                                            onClick={() => copyToClipboard(share.share_token, share.id)}
                                            title="Copy link"
                                        >
                                            {copiedId === share.id ? (
                                                <span className="text-emerald-500">✓</span>
                                            ) : (
                                                <SvgIcon svgType="copy" size={14} />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className="rfm-share-action-btn rfm-share-revoke-btn"
                                            onClick={() => handleRevoke(share.id)}
                                            title="Revoke"
                                        >
                                            <SvgIcon svgType="trash" size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </CommonModal>
    );
};

export default ShareModal;
