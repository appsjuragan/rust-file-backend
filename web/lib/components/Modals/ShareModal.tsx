import React, { useState, useEffect, useCallback, useRef } from "react";
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
    share_type: "public" | "user" | "group";
    password?: string;
    permission: "view" | "download";
    expires_in_hours: number;
    shared_with_group_id?: string;
    shared_with_user_id?: string;
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
  const [shareTargetType, setShareTargetType] = useState<
    "public" | "group" | "user"
  >("public");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [userGroups, setUserGroups] = useState<any[]>([]);
  const [existingShares, setExistingShares] = useState<ShareLink[]>([]);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newShareToken, setNewShareToken] = useState<string | null>(null);

  // User search state for "People" tab
  const [userQuery, setUserQuery] = useState("");
  const [userSuggestions, setUserSuggestions] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

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
      setShareTargetType("public");
      setSelectedGroupId("");
      setSelectedUsers([]);
      setUserQuery("");

      // Load user groups
      import("../../../src/services/adminService").then((mod) => {
        mod.adminService.listMyGroups().then((groups: any[]) => {
          setUserGroups(groups);
          if (groups.length > 0) setSelectedGroupId(groups[0].id);
        });
      });
    }
  }, [isVisible, file, loadShares]);

  // Close user dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userDropdownRef.current &&
        !userDropdownRef.current.contains(event.target as Node)
      ) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced user search
  useEffect(() => {
    if (shareTargetType !== "user") return;
    const delayDebounceFn = setTimeout(() => {
      if (userQuery.trim().length >= 1) {
        setIsSearchingUsers(true);
        import("../../../src/services/fileService").then((mod) => {
          mod.fileService
            .searchUsersForSharing(userQuery)
            .then((data: any[]) => {
              setUserSuggestions(data);
              setIsSearchingUsers(false);
              setIsUserDropdownOpen(true);
            })
            .catch(() => {
              setIsSearchingUsers(false);
            });
        });
      } else {
        setUserSuggestions([]);
        setIsUserDropdownOpen(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [userQuery, shareTargetType]);

  const handleCreate = async () => {
    if (!file) return;
    setCreating(true);
    try {
      if (shareTargetType === "user" && selectedUsers.length > 0) {
        // Multi-user share: create one for each selected person
        let lastToken = null;
        for (const user of selectedUsers) {
          const share = await onCreateShare({
            user_file_id: file.id,
            share_type: "user",
            password: usePassword ? password : undefined,
            permission,
            expires_in_hours: expiryHours,
            shared_with_user_id: user.id,
          });
          lastToken = share.share_token;
        }
        setNewShareToken(lastToken);
      } else {
        const share = await onCreateShare({
          user_file_id: file.id,
          share_type: shareTargetType,
          password: usePassword ? password : undefined,
          permission,
          expires_in_hours: expiryHours,
          shared_with_group_id:
            shareTargetType === "group" ? selectedGroupId : undefined,
          shared_with_user_id: undefined,
        });
        setNewShareToken(share.share_token);
      }
      await loadShares();
      setSelectedUsers([]);
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

  const getShareTypeBadge = (share: ShareLink) => {
    switch (share.share_type) {
      case "user":
        return (
          <span className="rfm-share-badge rfm-share-badge-type-user">
            <SvgIcon svgType="user" size={9} />
          </span>
        );
      case "group":
        return (
          <span className="rfm-share-badge rfm-share-badge-type-group">
            <SvgIcon svgType="folder" size={9} />
          </span>
        );
      default:
        return (
          <span className="rfm-share-badge rfm-share-badge-type-public">
            <SvgIcon svgType="share" size={9} />
          </span>
        );
    }
  };

  const isCreateDisabled =
    creating ||
    (usePassword && !password) ||
    (shareTargetType === "group" && !selectedGroupId) ||
    (shareTargetType === "user" && selectedUsers.length === 0);

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
            <label className="rfm-share-label">Share With</label>
            <div className="rfm-share-toggle-group">
              <button
                type="button"
                className={`rfm-share-toggle-btn ${shareTargetType === "public" ? "active" : ""}`}
                onClick={() => setShareTargetType("public")}
              >
                <SvgIcon svgType="share" size={13} />
                <span>Public</span>
              </button>
              <button
                type="button"
                className={`rfm-share-toggle-btn ${shareTargetType === "user" ? "active" : ""}`}
                onClick={() => setShareTargetType("user")}
              >
                <SvgIcon svgType="user" size={13} />
                <span>People</span>
              </button>
              <button
                type="button"
                className={`rfm-share-toggle-btn ${shareTargetType === "group" ? "active" : ""}`}
                onClick={() => setShareTargetType("group")}
              >
                <SvgIcon svgType="folder" size={13} />
                <span>Group</span>
              </button>
            </div>
          </div>

          {/* User search for "People" sharing */}
          {shareTargetType === "user" && (
            <div className="rfm-share-field">
              <label className="rfm-share-label">Select People</label>
              <div className="rfm-share-user-search" ref={userDropdownRef}>
                <div className="rfm-share-user-input-wrapper">
                  {selectedUsers.length > 0 && (
                    <div className="rfm-share-selected-users-list">
                      {selectedUsers.map((u) => (
                        <div key={u.id} className="rfm-share-user-pill">
                          <span className="rfm-share-user-pill-name">
                            {u.name || u.username}
                          </span>
                          <button
                            type="button"
                            className="rfm-share-user-pill-remove"
                            onClick={() =>
                              setSelectedUsers((prev) =>
                                prev.filter((usr) => usr.id !== u.id),
                              )
                            }
                          >
                            <SvgIcon svgType="close" size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rfm-share-input-row">
                    <SvgIcon svgType="search" size={14} />
                    <input
                      type="text"
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      onFocus={() => {
                        if (userSuggestions.length > 0)
                          setIsUserDropdownOpen(true);
                      }}
                      placeholder="Search people..."
                      className="rfm-share-user-input"
                    />
                  </div>
                  {isSearchingUsers && (
                    <div className="rfm-share-user-spinner" />
                  )}
                </div>

                {isUserDropdownOpen && userSuggestions.length > 0 && (
                  <div className="rfm-share-user-dropdown">
                    {userSuggestions.map((user: any) => {
                      const isAlreadySelected = selectedUsers.some(
                        (u) => u.id === user.id,
                      );
                      if (isAlreadySelected) return null;

                      return (
                        <div
                          key={user.id}
                          className="rfm-share-user-option"
                          onClick={() => {
                            setSelectedUsers((prev) => [...prev, user]);
                            setUserQuery("");
                            setIsUserDropdownOpen(false);
                            setUserSuggestions([]);
                          }}
                        >
                          <div className="rfm-share-user-option-avatar">
                            {(user.name || user.username || "U")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div className="rfm-share-user-option-info">
                            <span className="rfm-share-user-option-name">
                              {user.name || user.username}
                            </span>
                            <span className="rfm-share-user-option-username">
                              @{user.username}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {shareTargetType === "group" && (
            <div className="rfm-share-field">
              <label className="rfm-share-label">Select Group</label>
              <select
                className="rfm-share-input"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "rgba(0,0,0,0.4)",
                  color: "white",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {userGroups.length === 0 && (
                  <option disabled value="">
                    No groups available
                  </option>
                )}
                {userGroups.map((g) => (
                  <option key={g.id} value={g.id} style={{ color: "black" }}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                style={{ WebkitTextSecurity: "disc" } as any}
              />
            )}
          </div>

          <button
            type="button"
            className="rfm-share-create-btn"
            onClick={handleCreate}
            disabled={isCreateDisabled}
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
                      {getShareTypeBadge(share)}
                      <span
                        className="rfm-share-badge rfm-share-badge-permission"
                        title={
                          share.permission === "download"
                            ? "Download"
                            : "View Only"
                        }
                      >
                        <SvgIcon
                          svgType={
                            share.permission === "download" ? "download" : "eye"
                          }
                          size={10}
                        />
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
                      onClick={() =>
                        copyToClipboard(share.share_token, share.id)
                      }
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
