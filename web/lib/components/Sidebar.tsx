import React, { useMemo } from "react";
import { useFileManager } from "../context";
import SvgIcon from "./SvgIcon";
import type { FileType } from "../types";

const FolderTreeItem = ({ folder, level }: { folder: FileType; level: number }) => {
    const { fs, currentFolder, setCurrentFolder, onRefresh } = useFileManager();

    const subFolders = useMemo(() => {
        return fs.filter((f: FileType) => f.isDir && f.parentId === folder.id);
    }, [fs, folder.id]);

    const handleFolderClick = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setCurrentFolder(id);
        if (onRefresh) {
            try {
                await onRefresh(id);
            } catch (e) {
                console.error("Error during refresh", e);
            }
        }
    };

    return (
        <div className="rfm-sidebar-tree-item">
            <div
                className={`rfm-sidebar-item ${currentFolder === folder.id ? "active" : ""}`}
                onClick={(e) => handleFolderClick(e, folder.id)}
            >
                <SvgIcon svgType="folder" className="rfm-sidebar-icon" />
                <span className="rfm-sidebar-item-text">{folder.name}</span>
            </div>
            {subFolders.length > 0 && (
                <div className="rfm-sidebar-indent">
                    {subFolders.map((sub) => (
                        <FolderTreeItem key={sub.id} folder={sub} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};

const Sidebar = () => {
    const { fs, currentFolder, setCurrentFolder, onRefresh } = useFileManager();

    const rootFolders = useMemo(() => {
        return fs.filter((f: FileType) => f.isDir && (f.parentId === "0" || !f.parentId || f.parentId === "") && f.id !== "0");
    }, [fs]);

    const handleRootClick = async () => {
        setCurrentFolder("0");
        if (onRefresh) await onRefresh("0");
    };

    return (
        <aside className="rfm-sidebar">
            <div className="rfm-sidebar-list">
                <div
                    className={`rfm-sidebar-item ${currentFolder === "0" ? "active" : ""}`}
                    onClick={handleRootClick}
                >
                    <SvgIcon svgType="folder" className="rfm-sidebar-icon" />
                    <span className="rfm-sidebar-item-text">ROOT</span>
                </div>
                <div className="rfm-sidebar-indent">
                    {rootFolders.map((folder) => (
                        <FolderTreeItem key={folder.id} folder={folder} level={1} />
                    ))}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
