import React, { useMemo } from "react";
// Context
import { useFileManager } from "../context";
// Types
import type { FileType } from "../types";
import { ViewStyle } from "../types";
// Components
import SvgIcon from "./SvgIcon";

const FolderPath = () => {
  const { fs, currentFolder, setCurrentFolder, viewStyle, setViewStyle } = useFileManager();

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

  return (
    <div className="rfm-workspace-header">
      <div className="rfm-folder-path-container">
        <SvgIcon
          svgType="arrow-up"
          onClick={goUp}
          className="rfm-folder-path-svg"
        />
        <div className="rfm-breadcrumbs">
          <span
            className={`rfm-breadcrumb-item ${currentFolder === "0" ? "active" : ""}`}
            onClick={() => handleCrumbClick("0")}
          >
            ROOT
          </span>
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
        <SvgIcon
          svgType="list"
          className={`rfm-header-icon ${viewStyle === ViewStyle.List && "rfm-header-icon--selected"}`}
          onClick={() => setViewStyle(ViewStyle.List)}
        />
        <SvgIcon
          svgType="icons"
          className={`rfm-header-icon ${viewStyle === ViewStyle.Icons && "rfm-header-icon--selected"}`}
          onClick={() => setViewStyle(ViewStyle.Icons)}
        />
      </div>
    </div>
  );
};

export default FolderPath;
