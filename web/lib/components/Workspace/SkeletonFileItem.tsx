import React from 'react';

export const SkeletonFileItem = () => {
    return (
        <div className="rfm-file-item rfm-skeleton-item animate-pulse">
            <div className="rfm-file-icon rfm-skeleton-icon bg-gray-200 dark:bg-gray-700 rounded-lg w-12 h-12 mb-2"></div>
            <div className="rfm-file-name rfm-skeleton-text bg-gray-200 dark:bg-gray-700 h-3 w-20 rounded"></div>
        </div>
    );
};
