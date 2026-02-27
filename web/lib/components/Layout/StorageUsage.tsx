import React, { useMemo } from "react";
import SvgIcon from "../Icons/SvgIcon";
import { formatSize } from "../../utils/fileUtils";

// Helper for category colors
export const getCategoryColor = (cat: string): string => {
  switch (cat.toLowerCase()) {
    case "images":
      return "#f43f5e";
    case "videos":
      return "#8b5cf6";
    case "documents":
      return "#0ea5e9";
    case "archives":
      return "#f59e0b";
    case "audio":
      return "#10b981";
    default:
      return "#94a3b8";
  }
};

interface StorageUsageProps {
  userFacts: any;
  isMinimized: boolean;
  onToggleMinimized: () => void;
}

const StorageUsage = ({
  userFacts,
  isMinimized,
  onToggleMinimized,
}: StorageUsageProps) => {
  const totalStorage = userFacts?.storage_limit || 5 * 1024 * 1024 * 1024;
  const usedStorage = userFacts?.total_size || 0;
  const storagePercentage = Math.min(
    100,
    Math.round((usedStorage / totalStorage) * 100),
  );

  const sortedCategories = useMemo(() => {
    if (!userFacts) return [];
    return [
      { cat: "Images", count: userFacts.image_count, label: "images" },
      { cat: "Videos", count: userFacts.video_count, label: "videos" },
      { cat: "Docs", count: userFacts.document_count, label: "documents" },
      { cat: "Audio", count: userFacts.audio_count, label: "audio" },
      { cat: "Other", count: userFacts.others_count, label: "others" },
    ]
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [userFacts]);

  if (!userFacts) return null;

  return (
    <div className={`rfm-sidebar-facts ${isMinimized ? "minimized" : ""}`}>
      <div className="rfm-facts-header" onClick={onToggleMinimized}>
        <div className="rfm-facts-title font-bold text-[10px] opacity-80 uppercase tracking-wider">
          <SvgIcon svgType="info" size={14} className="mr-1.5 opacity-70" />
          Storage Usage
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

      {!isMinimized ? (
        <div className="rfm-facts-container">
          <div className="rfm-facts-content">
            <div className="flex items-center gap-4 mb-3 mt-1">
              <div className="rfm-facts-pie-container">
                {usedStorage > 0 ? (
                  <svg className="rfm-facts-pie-svg" viewBox="0 0 32 32">
                    {/* Background Circle */}
                    <circle
                      r="12"
                      cx="16"
                      cy="16"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="4"
                      className="text-stone-200 dark:text-slate-700"
                    />
                    {/* Progress Circle (Circumference = 2 * pi * 12 ~= 75.4) */}
                    <circle
                      r="12"
                      cx="16"
                      cy="16"
                      fill="transparent"
                      stroke="#0d9488"
                      strokeWidth="4"
                      strokeDasharray={`${
                        (storagePercentage / 100) * 75.4
                      } 75.4`}
                      strokeLinecap="round"
                    />
                    <text
                      x="16"
                      y="16"
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="rfm-pie-percentage"
                    >
                      {storagePercentage}%
                    </text>
                  </svg>
                ) : (
                  <div className="rfm-facts-pie-empty" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="rfm-fact-item truncate">
                  {formatSize(usedStorage)} of {formatSize(totalStorage)}
                </div>
                <div className="text-[10px] text-stone-500 dark:text-slate-400 font-medium">
                  {formatSize(totalStorage - usedStorage)} free
                </div>
              </div>
            </div>

            <div className="rfm-fact-category-list">
              {sortedCategories.slice(0, 3).map((item) => (
                <div key={item.label} className="rfm-fact-sub-item">
                  <span
                    className="dot"
                    style={{
                      backgroundColor: getCategoryColor(item.label),
                    }}
                  />
                  <span className="flex-1 truncate capitalize">{item.cat}</span>
                  <span className="font-semibold text-stone-700 dark:text-slate-300 text-[10px]">
                    {item.count} items
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rfm-facts-minimized-info"
          onClick={() => onToggleMinimized()}
        >
          {storagePercentage}% used • {formatSize(usedStorage)}
        </div>
      )}
    </div>
  );
};

export default StorageUsage;
