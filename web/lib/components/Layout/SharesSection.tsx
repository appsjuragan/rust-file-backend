import React from "react";
import SvgIcon from "../Icons/SvgIcon";
import ShareItem from "./ShareItem";
import type { ShareLink } from "../../types";

interface SharesSectionProps {
  activeShares: ShareLink[];
  isMinimized: boolean;
  onToggleMinimized: () => void;
  onRemoveShare: (share: ShareLink) => void;
  onCopyShareLink: (share: ShareLink) => void;
  onSelectShare: (share: ShareLink) => void;
}

const SharesSection = ({
  activeShares,
  isMinimized,
  onToggleMinimized,
  onRemoveShare,
  onCopyShareLink,
  onSelectShare,
}: SharesSectionProps) => {
  if (activeShares.length === 0) return null;

  return (
    <div className={`rfm-sidebar-facts ${isMinimized ? "minimized" : ""}`}>
      <div className="rfm-facts-header" onClick={onToggleMinimized}>
        <div className="rfm-facts-title font-bold text-[10px] opacity-80 uppercase tracking-wider">
          <SvgIcon svgType="share" size={14} className="mr-1.5 opacity-70" />
          Shared Links
        </div>
        <button
          type="button"
          className="rfm-facts-toggle-btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleMinimized();
          }}
        >
          <SvgIcon svgType={isMinimized ? "plus" : "minus"} size={12} />
        </button>
      </div>

      {!isMinimized && (
        <div className="rfm-facts-container">
          <div className="rfm-facts-content">
            <div
              className="rfm-sidebar-favorites-scroll"
              style={{ maxHeight: "200px" }}
            >
              <div className="rfm-fact-category-list">
                {activeShares.map((share) => (
                  <ShareItem
                    key={share.id}
                    share={share}
                    onRemove={() => onRemoveShare(share)}
                    onCopyLink={() => onCopyShareLink(share)}
                    onSelect={() => onSelectShare(share)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharesSection;
