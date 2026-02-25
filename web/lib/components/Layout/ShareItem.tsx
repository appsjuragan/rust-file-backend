import React, { useState } from "react";
import SvgIcon from "../Icons/SvgIcon";
import type { ShareLink } from "../../types";
import { formatShareExpiry } from "../../utils/fileUtils";

interface ShareItemProps {
    share: ShareLink;
    onRemove: () => void;
    onCopyLink: () => void;
    onSelect: () => void;
}

const ShareItem = ({
    share,
    onRemove,
    onCopyLink,
    onSelect,
}: ShareItemProps) => {
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
        if (diff < 0) {
            setSwipeX(Math.max(diff, -70));
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
                style={{ backgroundColor: "#ef4444" }}
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
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    padding: "0.5rem 0.75rem",
                    gap: "0.25rem",
                }}
                onClick={() => {
                    if (swipeX === 0) onSelect();
                    else setSwipeX(0);
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
                    <SvgIcon
                        svgType={share.is_folder ? "folder" : "file"}
                        size={16}
                        className="mr-2 opacity-70"
                    />
                    <span className="flex-1 truncate text-xs font-semibold">
                        {share.filename || "Unknown"}
                    </span>
                    <button
                        type="button"
                        className="rfm-favorite-remove-btn mr-1"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCopyLink();
                        }}
                        title="Copy Share Link"
                    >
                        <SvgIcon svgType="copy" size={14} />
                    </button>
                    <button
                        type="button"
                        className="rfm-favorite-remove-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        title="Revoke Share"
                    >
                        <SvgIcon svgType="trash" size={14} />
                    </button>
                </div>
                <div
                    style={{
                        display: "flex",
                        width: "100%",
                        alignItems: "center",
                        gap: "0.375rem",
                        paddingLeft: "1.5rem",
                        opacity: 0.8,
                    }}
                >
                    <span className="flex items-center justify-center bg-stone-200 dark:bg-slate-700 p-1 rounded text-stone-600 dark:text-slate-300" title={share.permission === "download" ? "Download" : "View Only"}>
                        <SvgIcon svgType={share.permission === "download" ? "download" : "eye"} size={10} />
                    </span>
                    <span
                        className="text-[10px] text-stone-500 truncate min-w-0"
                        style={{ maxWidth: "80px" }}
                    >
                        {formatShareExpiry(share.expires_at)}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ShareItem;
