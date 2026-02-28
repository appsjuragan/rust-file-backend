import React, { useMemo, useState, useRef, useEffect } from "react";
// Context
import { useFileManager } from "../../context";
// Types
import type { FileType } from "../../types";
import { ViewStyle, SortField, SortDirection, IconSize } from "../../types";
import { ArrowDown, ArrowUp, ChevronDown, Check } from "lucide-react";
// Components
import SvgIcon from "../Icons/SvgIcon";

const FolderPath = ({ visible = true }: { visible?: boolean }) => {
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
    setSortDirection,
    iconSize,
    setIconSize,
    folderTree,
    showThumbnails,
    setShowThumbnails,
    isLoading,
  } = useFileManager();

  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [menuClicked, setMenuClicked] = useState(() => {
    return localStorage.getItem("rfm-menu-clicked") === "true";
  });
  const sortRef = useRef<HTMLDivElement>(null);

  const handleMenuClick = () => {
    setSidebarVisible(!sidebarVisible);
    if (!menuClicked) {
      setMenuClicked(true);
      localStorage.setItem("rfm-menu-clicked", "true");
    }
  };

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
    { value: SortField.Type, label: "File Type" },
    { value: SortField.Date, label: "Date" },
  ];

  const goUp = () => {
    const currentFolderInfo =
      fs.find((f: FileType) => f.id === currentFolder) ||
      folderTree.find((f) => f.id === currentFolder);

    if (currentFolderInfo) {
      const parentId =
        (currentFolderInfo as FileType).parentId ||
        (currentFolderInfo as any).parent_id ||
        "0";
      setCurrentFolder(parentId);
    } else if (currentFolder !== "0") {
      // Last resort fallback
      setCurrentFolder("0");
    }
  };

  const breadcrumbs = useMemo(() => {
    const crumbs: { id: string; name: string; parentId: string }[] = [];
    let currentId = currentFolder;

    while (currentId !== "0" && currentId) {
      const folder = fs.find((f: FileType) => f.id === currentId);
      if (folder) {
        crumbs.unshift({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId || "0",
        });
        currentId = folder.parentId || "0";
      } else {
        const treeFolder = folderTree.find((f) => f.id === currentId);
        if (treeFolder) {
          crumbs.unshift({
            id: treeFolder.id,
            name: treeFolder.filename,
            parentId: treeFolder.parent_id || "0",
          });
          currentId = treeFolder.parent_id || "0";
        } else {
          break;
        }
      }
    }

    return crumbs;
  }, [fs, folderTree, currentFolder]);

  const handleCrumbClick = (id: string) => {
    setCurrentFolder(id);
  };

  const itemCount = useMemo(() => {
    return fs.filter(
      (f: FileType) => (f.parentId || "0") === currentFolder && f.name !== "/",
    ).length;
  }, [fs, currentFolder]);

  const breadcrumbContent = (
    <>
      <div
        className="rfm-breadcrumb-up-icon"
        onClick={currentFolder !== "0" ? goUp : undefined}
        title={currentFolder !== "0" ? "Go up one folder" : "You are at home"}
        style={{
          cursor: currentFolder === "0" ? "default" : "pointer",
          opacity: currentFolder === "0" ? 0.6 : 1,
        }}
      >
        <SvgIcon svgType={currentFolder === "0" ? "home" : "arrow-up"} />
      </div>
      <div className="rfm-breadcrumbs">
        <div
          className={`rfm-breadcrumb-item ${currentFolder === "0" ? "active" : ""
            }`}
          onClick={() => handleCrumbClick("0")}
        >
          <span>Home</span>
        </div>
        {breadcrumbs.length > 3 ? (
          <>
            <span className="rfm-breadcrumb-separator">/</span>
            <span className="rfm-breadcrumb-item cursor-default hover:text-stone-600 dark:hover:text-slate-400">
              ...
            </span>
            {breadcrumbs.slice(-3).map((crumb) => (
              <React.Fragment key={crumb.id}>
                <span className="rfm-breadcrumb-separator">/</span>
                <span
                  className={`rfm-breadcrumb-item ${currentFolder === crumb.id ? "active" : ""
                    }`}
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
                className={`rfm-breadcrumb-item ${currentFolder === crumb.id ? "active" : ""
                  }`}
                onClick={() => handleCrumbClick(crumb.id)}
              >
                {crumb.name}
              </span>
            </React.Fragment>
          ))
        )}
        <span className="rfm-breadcrumb-count">
          {isLoading ? (
            <div className="rfm-spinner-small" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}></div>
          ) : (
            <>{itemCount} {itemCount === 1 ? "item" : "items"}</>
          )}
        </span>
      </div>
    </>
  );

  return (
    <div className="rfm-workspace-header">
      {/* Top Row: Navigation Toggles & Action Buttons */}
      <div className="rfm-toolbar">
        <div className="rfm-toolbar-group">
          <div
            className={`rfm-folder-path-svg ${!sidebarVisible && !menuClicked ? "rfm-header-icon--pulse" : ""
              }`}
            onClick={handleMenuClick}
            title={sidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
          >
            <SvgIcon svgType="menu" />
          </div>
        </div>

        {/* Desktop Breadcrumbs (Hidden on Mobile via CSS) */}
        <div
          className={`rfm-toolbar-breadcrumbs ${!visible ? "is-breadcrumb-hidden" : ""
            }`}
        >
          {breadcrumbContent}
        </div>

        <div className="rfm-header-container">
          <div
            className="rfm-header-icon"
            onClick={() =>
              setViewStyle(
                viewStyle === ViewStyle.Icons
                  ? ViewStyle.List
                  : ViewStyle.Icons,
              )
            }
            title={
              viewStyle === ViewStyle.Icons
                ? "Switch to List View"
                : "Switch to Grid View"
            }
          >
            <SvgIcon
              svgType={viewStyle === ViewStyle.Icons ? "list" : "icons"}
            />
          </div>

          <div
            className="rfm-header-icon"
            onClick={() => {
              if (iconSize === IconSize.Small) setIconSize(IconSize.Medium);
              else if (iconSize === IconSize.Medium)
                setIconSize(IconSize.Large);
              else if (iconSize === IconSize.Large)
                setIconSize(IconSize.ExtraLarge);
              else setIconSize(IconSize.Small);
            }}
            title={`View Size: ${iconSize}`}
          >
            {iconSize === IconSize.Small && <SvgIcon svgType="size-small" />}
            {iconSize === IconSize.Medium && <SvgIcon svgType="size-medium" />}
            {iconSize === IconSize.Large && <SvgIcon svgType="size-large" />}
            {iconSize === IconSize.ExtraLarge && (
              <SvgIcon svgType="size-xlarge" />
            )}
          </div>

          {/* Custom Sort Controls */}
          <div className="rfm-sort-group" ref={sortRef}>
            <div
              className={`rfm-sort-trigger ${sortMenuVisible ? "active" : ""}`}
              onClick={() => setSortMenuVisible(!sortMenuVisible)}
            >
              <span>
                {sortOptions.find((o) => o.value === sortField)?.label}
              </span>
              <ChevronDown
                size={14}
                className={`rfm-sort-chevron ${sortMenuVisible ? "open" : ""}`}
              />
            </div>

            {sortMenuVisible && (
              <div className="rfm-sort-menu">
                {sortOptions.map((option) => (
                  <div
                    key={option.value}
                    className={`rfm-sort-option ${sortField === option.value ? "selected" : ""
                      }`}
                    onClick={() => {
                      setSortField(option.value);
                      setSortMenuVisible(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {sortField === option.value && (
                      <Check size={14} className="text-teal-500" />
                    )}
                  </div>
                ))}

                <div className="rfm-sort-separator" />

                <div
                  className={`rfm-sort-option ${showThumbnails ? "selected" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowThumbnails(!showThumbnails);
                  }}
                >
                  <span>Enable Thumbnails</span>
                  {showThumbnails && <Check size={14} className="text-teal-500" />}
                </div>
              </div>
            )}

            <div
              className="rfm-sort-direction"
              onClick={() =>
                setSortDirection(
                  sortDirection === SortDirection.Asc
                    ? SortDirection.Desc
                    : SortDirection.Asc,
                )
              }
              title={
                sortDirection === SortDirection.Asc ? "Ascending" : "Descending"
              }
            >
              {sortDirection === SortDirection.Asc ? (
                <ArrowUp size={16} />
              ) : (
                <ArrowDown size={16} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Breadcrumbs Row (Hidden on Desktop via CSS) */}
      <div
        className={`rfm-breadcrumb-bar ${!visible ? "is-breadcrumb-hidden" : ""
          }`}
      >
        {breadcrumbContent}
      </div>
    </div>
  );
};

export default FolderPath;
