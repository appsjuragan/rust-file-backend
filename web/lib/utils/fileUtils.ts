import type { FileType } from "../types";

/**
 * Checks if a target folder is a descendant of (or the same as) a source folder.
 * This is used to prevent circular moves in the file system.
 */
export const isDescendantOrSelf = (fs: FileType[], sourceId: string, targetId: string): boolean => {
    if (sourceId === targetId) return true;

    let currentId: string | undefined = targetId;
    const visited = new Set<string>(); // Prevent infinite loops if cycles already exist

    while (currentId && currentId !== "0" && !visited.has(currentId)) {
        visited.add(currentId);
        const item = fs.find(f => f.id === currentId);
        if (!item || !item.parentId) break;

        if (item.parentId === sourceId) return true;
        currentId = item.parentId;
    }

    return false;
};

export const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};
