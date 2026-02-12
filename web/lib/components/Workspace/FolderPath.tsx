import React, { useMemo } from "react";
// Context
import { useFileManager } from "../../context";
// Types
import type { FileType } from "../../types";
import { ViewStyle } from "../../types";
// Components
import SvgIcon from "../Icons/SvgIcon";

const FolderPath = () => {
  const {
    fs,
    currentFolder,
    setCurrentFolder,
    viewStyle,
    setViewStyle,
    openUpload,
    setNewFolderModalVisible,
    selectedIds,
    setSelectedIds,
    clipboardIds,
    setClipboardIds,
    isCut,
    setIsCut,
    onBulkMove,
    onBulkCopy,
    onRefresh,
    sidebarVisible,
    setSidebarVisible
  } = useFileManager();

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

  const breadcrumbContent = (
    <>
      <div
        className="rfm-breadcrumb-up-icon"
        onClick={currentFolder !== "0" ? goUp : undefined}
        title={currentFolder !== "0" ? "Go up one folder" : "You are at home"}
        style={{ cursor: currentFolder === "0" ? 'default' : 'pointer', opacity: currentFolder === "0" ? 0.3 : 1 }}
      >
        <SvgIcon svgType="arrow-up" />
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
    </>
  );

  return (
    <div className="rfm-workspace-header">
      {/* Top Row: Navigation Toggles & Action Buttons */}
      <div className="rfm-toolbar">
        <div className="rfm-toolbar-group">
          <div
            className={`rfm-folder-path-svg ${!sidebarVisible ? "rfm-header-icon--pulse" : ""}`}
            onClick={() => setSidebarVisible(!sidebarVisible)}
            title={sidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
          >
            <SvgIcon svgType="menu" />
          </div>
        </div>

        {/* Desktop Breadcrumbs (Hidden on Mobile via CSS) */}
        <div className="rfm-toolbar-breadcrumbs">
          {breadcrumbContent}
        </div>

        <div className="rfm-header-container">
          {/* ... existing selection & actions ... */}
          <div className="rfm-mobile-actions">
            {fs.some(f => f.parentId === currentFolder) && (
              <div
                className={`rfm-header-icon ${selectedIds.length === fs.filter(f => f.parentId === currentFolder).length ? "rfm-header-icon--selected" : ""}`}
                onClick={() => {
                  const folderFiles = fs.filter(f => f.parentId === currentFolder);
                  if (selectedIds.length === folderFiles.length) {
                    setSelectedIds([]);
                  } else {
                    setSelectedIds(folderFiles.map(f => f.id));
                  }
                }}
                title="Select All"
              >
                <SvgIcon svgType="square" />
              </div>
            )}

            {selectedIds.length > 0 && (
              <>
                <div
                  className="rfm-header-icon"
                  onClick={() => {
                    setClipboardIds(selectedIds);
                    setIsCut(false);
                  }}
                  title="Copy"
                >
                  <SvgIcon svgType="copy" />
                </div>
                <div
                  className="rfm-header-icon"
                  onClick={() => {
                    setClipboardIds(selectedIds);
                    setIsCut(true);
                  }}
                  title="Move (Cut)"
                >
                  <SvgIcon svgType="scissors" />
                </div>
              </>
            )}

            {clipboardIds.length > 0 && (
              <div
                className="rfm-header-icon rfm-header-icon--pulse"
                onClick={async () => {
                  if (isCut) {
                    if (onBulkMove) await onBulkMove(clipboardIds, currentFolder);
                    setClipboardIds([]);
                    setIsCut(false);
                  } else {
                    if (onBulkCopy) await onBulkCopy(clipboardIds, currentFolder);
                  }
                  if (onRefresh) await onRefresh(currentFolder);
                }}
                title={`Paste ${clipboardIds.length} item(s)`}
              >
                <SvgIcon svgType="clipboard" />
              </div>
            )}
          </div>

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

      {/* Mobile Breadcrumbs Row (Hidden on Desktop via CSS) */}
      <div className="rfm-breadcrumb-bar">
        {breadcrumbContent}
      </div>
    </div>
  );
};

export default FolderPath;
