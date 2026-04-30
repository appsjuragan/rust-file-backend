import React, { ChangeEvent } from "react";
import { CommonModal } from "../../../../../lib/components"; // Or just "../../../../../lib"
import { Edit2 } from "lucide-react";
import "./Modals.css";

interface ProfileModalProps {
  isVisible: boolean;
  onClose: () => void;
  profile: {
    name?: string;
    email?: string;
    avatarUrl?: string;
  };
  username: string;
  editName: string;
  setEditName: (val: string) => void;
  editEmail: string;
  setEditEmail: (val: string) => void;
  editPassword: string;
  setEditPassword: (val: string) => void;
  trashCleanupDays: number;
  setTrashCleanupDays: (val: number) => void;
  editPin: string;
  setEditPin: (val: string) => void;
  onSave: () => void;
  onAvatarChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isVisible,
  onClose,
  profile,
  username,
  editName,
  setEditName,
  editEmail,
  setEditEmail,
  editPassword,
  setEditPassword,
  trashCleanupDays,
  setTrashCleanupDays,
  editPin,
  setEditPin,
  onSave,
  onAvatarChange,
}) => {
  return (
    <CommonModal
      isVisible={isVisible}
      title="Edit Profile"
      onClose={onClose}
      className="rfm-profile-modal"
      autoHeight={true}
    >
      <div className="rfm-profile-content">
        <div className="rfm-profile-avatar-section">
          <div className="rfm-profile-avatar-large">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Profile" />
            ) : (
              <div className="rfm-avatar-placeholder-large">
                {(profile.name || username).charAt(0).toUpperCase()}
              </div>
            )}
            <label className="rfm-avatar-upload-btn">
              <Edit2 size={14} />
              <input
                type="file"
                hidden
                accept="image/*"
                onChange={onAvatarChange}
              />
            </label>
          </div>
          <div className="rfm-profile-header-text">
            <h3>{profile.name || username}</h3>
            <p>{profile.email || "No email set"}</p>
          </div>
        </div>

        <div className="rfm-form-group">
          <label>Display Name</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Enter your name"
            className="rfm-input"
          />
        </div>

        <div className="rfm-form-group">
          <label>Email Address</label>
          <input
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            placeholder="email@example.com"
            className="rfm-input"
          />
        </div>

        <div className="rfm-form-group">
          <label>New Password (Optional)</label>
          <input
            type="password"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
            placeholder="Leave blank to keep current"
            className="rfm-input"
          />
        </div>
        <div className="rfm-form-group">
          <label>Trash Retention Period (Days)</label>
          <input
            type="number"
            value={trashCleanupDays}
            onChange={(e) => setTrashCleanupDays(parseInt(e.target.value) || 0)}
            placeholder="30"
            className="rfm-input"
            min="1"
            max="365"
          />
          <span style={{ fontSize: "11px", opacity: 0.6, marginTop: "4px", display: "block" }}>
            Items in trash will be permanently deleted after this many days. Default is 30.
          </span>
        </div>

        <div className="rfm-form-group">
          <label>Security PIN (6 Digits)</label>
          <input
            type="password"
            maxLength={6}
            value={editPin}
            onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Set or update PIN"
            className="rfm-input"
          />
          <span style={{ fontSize: "11px", opacity: 0.6, marginTop: "4px", display: "block" }}>
            Used for locking/unlocking sensitive files and folders.
          </span>
        </div>

        <div className="rfm-modal-actions right">
          <button className="rfm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="rfm-btn-primary" onClick={onSave}>
            Save Changes
          </button>
        </div>
      </div>
    </CommonModal>
  );
};
