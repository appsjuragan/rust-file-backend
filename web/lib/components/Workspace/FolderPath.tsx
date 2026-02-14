import React, { useMemo, useState, useRef, useEffect } from "react";
// Context
import { useFileManager } from "../../context";
// Types
import type { FileType } from "../../types";
import { ViewStyle, SortField, SortDirection } from "../../types";
import { ArrowDown, ArrowUp, ChevronDown, Check } from "lucide-react";
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
    setSidebarVisible,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection
  } = useFileManager();

  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setSortMenuVisible(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const sortOptions = [
    { value: SortField.Name, label: "Name" },
    { value: SortField.Size, label: "Size" },
    { value: SortField.Type, label: "Mime" },
    { value: SortField.Date, label: "Date" },
  ];

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
        {breadcrumbs.length > 3 ? (
          <>
            <span className="rfm-breadcrumb-separator">/</span>
            <span className="rfm-breadcrumb-item cursor-default hover:text-stone-600 dark:hover:text-slate-400">...</span>
            {breadcrumbs.slice(-3).map((crumb) => (
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
          </>
        ) : (
          breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <span className="rfm-breadcrumb-separator">/</span>
              <span
                className={`rfm-breadcrumb-item ${currentFolder === crumb.id ? "active" : ""}`}
                onClick={() => handleCrumbClick(crumb.id)}
              >
                {crumb.name}
              </span>
            </React.Fragment>
          ))
        )}
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
          <div
            className="rfm-header-icon"
            onClick={() => setViewStyle(viewStyle === ViewStyle.Icons ? ViewStyle.List : ViewStyle.Icons)}
            title={viewStyle === ViewStyle.Icons ? "Switch to List View" : "Switch to Grid View"}
          >
            <SvgIcon svgType={viewStyle === ViewStyle.Icons ? "list" : "icons"} />
          </div>

          {/* Custom Sort Controls */}
          <div className="rfm-sort-group" ref={sortRef}>
            <div
              className={`rfm-sort-trigger ${sortMenuVisible ? 'active' : ''}`}
              onClick={() => setSortMenuVisible(!sortMenuVisible)}
            >
              <span>{sortOptions.find(o => o.value === sortField)?.label}</span>
              <ChevronDown size={14} className={`rfm-sort-chevron ${sortMenuVisible ? 'open' : ''}`} />
            </div>

            {sortMenuVisible && (
              <div className="rfm-sort-menu">
                {sortOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`rfm-sort-option ${sortField === option.value ? 'selected' : ''}`}
                    onClick={() => {
                      setSortField(option.value);
                      setSortMenuVisible(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {sortField === option.value && <Check size={14} className="text-teal-500" />}
                  </div>
                ))}
              </div>
            )}

            <div
              className="rfm-sort-direction"
              onClick={() => setSortDirection(sortDirection === SortDirection.Asc ? SortDirection.Desc : SortDirection.Asc)}
              title={sortDirection === SortDirection.Asc ? "Ascending" : "Descending"}
            >
              {sortDirection === SortDirection.Asc ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            </div>
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
