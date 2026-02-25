import React from "react";

interface SkeletonTableRowProps {
  columnsCount: number;
}

export const SkeletonTableRow: React.FC<SkeletonTableRowProps> = ({
  columnsCount,
}) => {
  return (
    <tr className="rfm-file-row rfm-skeleton-row animate-pulse">
      {Array.from({ length: columnsCount }).map((_, index) => (
        <td key={index} className="px-4 py-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
        </td>
      ))}
    </tr>
  );
};
