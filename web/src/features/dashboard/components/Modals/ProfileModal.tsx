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
