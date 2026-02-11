import React, { useMemo } from "react";
// Context
import { useFileManager } from "../../context";
// Types
import type { FileType } from "../../types";
import { ViewStyle } from "../../types";
// Components
import SvgIcon from "../Icons/SvgIcon";

const FolderPath = () => {
  const { fs, currentFolder, setCurrentFolder, viewStyle, setViewStyle, openUpload, setNewFolderModalVisible } = useFileManager();

  const goUp = () => {
    const currentFolderInfo = fs.find((f: FileType) => f.id === currentFolder);
    if (currentFolderInfo && currentFolderInfo.parentId) {
      setCurrentFolder(currentFolderInfo.parentId);
    }
  };

  const breadcrumbs = useMemo(() => {
    const crumbs: FileType[] = [];
    let currentId = currentFolder;

    while (currentId !== "0") {
      const folder = fs.find((f: FileType) => f.id === currentId);
      if (folder) {
        crumbs.unshift(folder);
        currentId = folder.parentId || "0";
      } else {
        break;
      }
    }

    return crumbs;
  }, [fs, currentFolder]);

  const handleCrumbClick = (id: string) => {
    setCurrentFolder(id);
  };

  const parentFolder = useMemo(() => {
    return fs.find((f: FileType) => f.id === currentFolder)?.parentId || (currentFolder !== "0" ? "0" : null);
  }, [fs, currentFolder]);

  return (
    <div className="rfm-workspace-header">
      <div className="rfm-folder-path-container">
        <div
          className={`rfm-folder-path-svg ${currentFolder === "0" ? "at-home" : ""}`}
          onClick={currentFolder !== "0" ? goUp : undefined}
          title={currentFolder !== "0" ? "Go up one folder" : "You are at home"}
          style={{ cursor: currentFolder === "0" ? 'default' : 'pointer' }}
        >
          <SvgIcon
            svgType={currentFolder === "0" ? "home" : "arrow-up"}
          />
        </div>
        <div className="rfm-breadcrumbs">
          <div
            className={`rfm-breadcrumb-item ${currentFolder === "0" ? "active" : ""}`}
            onClick={() => handleCrumbClick("0")}
          >
            <span>Home</span>
          </div>
          {breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <span className="rfm-breadcrumb-separator">/</span>
              <span
                className={`rfm-breadcrumb-item ${currentFolder === crumb.id ? "active" : ""}`}
                onClick={() => handleCrumbClick(crumb.id)}
              >
                {crumb.name}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="rfm-header-container">
        <div className="rfm-mobile-actions">
          <div
            className="rfm-header-icon"
            onClick={openUpload}
            title="Upload Files"
          >
            <SvgIcon svgType="upload" />
          </div>
          <div
            className="rfm-header-icon"
            onClick={() => setNewFolderModalVisible && setNewFolderModalVisible(true)}
            title="New Folder"
          >
            <SvgIcon svgType="plus" />
          </div>
        </div>
        <div
          className={`rfm-header-icon ${viewStyle === ViewStyle.List ? "rfm-header-icon--selected" : ""}`}
          onClick={() => setViewStyle(ViewStyle.List)}
          title="List View"
        >
          <SvgIcon svgType="list" />
        </div>
        <div
          className={`rfm-header-icon ${viewStyle === ViewStyle.Icons ? "rfm-header-icon--selected" : ""}`}
          onClick={() => setViewStyle(ViewStyle.Icons)}
          title="Grid View"
        >
          <SvgIcon svgType="icons" />
        </div>
      </div>
    </div>
  );
};

export default FolderPath;
