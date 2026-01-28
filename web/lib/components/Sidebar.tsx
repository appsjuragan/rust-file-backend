import React, { useMemo } from "react";
import { useFileManager } from "../context";
import SvgIcon from "./SvgIcon";
import type { FileType } from "../types";

const Sidebar = () => {
    const { fs, currentFolder, setCurrentFolder, onRefresh } = useFileManager();

    const folders = useMemo(() => {
        // Only show top-level folders in sidebar as per image
        return fs.filter((f: FileType) => f.isDir && f.id !== "0");
    }, [fs]);

    const handleFolderClick = async (id: string) => {
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
        <aside className="rfm-sidebar">
            <div className="rfm-sidebar-list">
                <div
                    className={`rfm-sidebar-item ${currentFolder === "0" ? "active" : ""}`}
                    onClick={() => handleFolderClick("0")}
                >
                    <SvgIcon svgType="folder" className="rfm-sidebar-icon" />
                    <span className="rfm-sidebar-item-text">ROOT</span>
                </div>
                {folders.map((folder) => (
                    <div
                        key={folder.id}
                        className={`rfm-sidebar-item ${currentFolder === folder.id ? "active" : ""}`}
                        onClick={() => handleFolderClick(folder.id)}
                    >
                        <SvgIcon svgType="folder" className="rfm-sidebar-icon" />
                        <span className="rfm-sidebar-item-text">{folder.name}</span>
                    </div>
                ))}
            </div>
        </aside>
    );
};

export default Sidebar;
