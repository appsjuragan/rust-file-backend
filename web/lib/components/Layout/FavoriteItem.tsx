import React, { useState } from "react";
import SvgIcon from "../Icons/SvgIcon";
import type { FileType } from "../../types";

interface FavoriteItemProps {
  fav: FileType;
  onRemove: () => void;
  onSelect: (f: FileType) => void;
}

const FavoriteItem = ({ fav, onRemove, onSelect }: FavoriteItemProps) => {
  const [swipeX, setSwipeX] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!e.touches[0]) return;
    setTouchStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || !e.touches[0]) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX;
    // Only allow swiping left
    if (diff < 0) {
      setSwipeX(Math.max(diff, -70)); // Limit swipe to 70px
    } else {
      setSwipeX(0);
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    if (swipeX < -40) {
      setSwipeX(-70);
    } else {
      setSwipeX(0);
    }
  };

  return (
    <div className="rfm-swipe-item-container">
      <div
        className="rfm-swipe-action-bg"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <SvgIcon svgType="trash" size={20} className="text-white" />
      </div>
      <div
        className="rfm-fact-sub-item rfm-swipable-item cursor-pointer hover:bg-stone-200 dark:hover:bg-slate-800 group"
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping
            ? "none"
            : "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={() => {
          if (swipeX === 0) onSelect(fav);
          else setSwipeX(0);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <SvgIcon
          svgType={fav.isDir ? "folder" : "file"}
          size={16}
          className="mr-2 opacity-70"
        />
        <span className="flex-1 truncate">{fav.name}</span>

        {/* Desktop-only remove icon */}
        <button
          type="button"
          className="rfm-favorite-remove-btn"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from Favorites"
        >
          <SvgIcon svgType="trash" size={14} />
        </button>
      </div>
    </div>
  );
};

export default FavoriteItem;
