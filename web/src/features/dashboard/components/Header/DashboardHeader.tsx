import React, { useRef, useEffect } from "react";
import {
  Search,
  User,
  Moon,
  LogOut,
  ChevronDown,
  Sun,
  Folder,
  File,
} from "lucide-react";
import { FileType } from "../../../../../lib/types";
import { FileIcon, FolderPath, SvgIcon } from "../../../../../lib";
import "./DashboardHeader.css";

interface DashboardHeaderProps {
  profile: { name?: string; email?: string; avatarUrl?: string };
  username: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  dropdownVisible: boolean;
  setDropdownVisible: (visible: boolean) => void;
  setProfileModalVisible: (visible: boolean) => void;
  theme: string;
  toggleTheme: () => void;
  onLogout: () => void;
  searchSuggestions?: FileType[];
  isSearching?: boolean;
  onSearchResultClick?: (file: FileType) => void;
  sidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  profile,
  username,
  searchQuery,
  setSearchQuery,
  dropdownVisible,
  setDropdownVisible,
  setProfileModalVisible,
  theme,
  toggleTheme,
  onLogout,
  searchSuggestions = [],
  isSearching = false,
  onSearchResultClick,
  setSidebarVisible,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownVisible(false);
      }
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setSearchQuery("");
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDropdownVisible(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownVisible, setDropdownVisible, setSearchQuery]);

  return (
    <header className="app-header">
      <div
        className="logo cursor-pointer"
        onClick={() => window.location.reload()}
      >
        <div className="rfm-app-logo !w-8 !h-8 !rounded-xl !p-1.5">
          <SvgIcon svgType="rocket" className="rfm-app-logo-icon" />
        </div>
        <div className="rfm-app-title !gap-0">
          <span className="rfm-app-title-main !text-sm !tracking-tight">
            Juragan
          </span>
          <span className="rfm-app-title-sub !text-sm !tracking-tight !-mt-1">
            Cloud
          </span>
        </div>
      </div>
      <div className="global-search-container">
        <div className="search-input-wrapper" ref={searchRef}>
          <Search className="search-icon-svg" size={18} />
          <input
            type="text"
            placeholder="Global file search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="global-search-input"
          />

          {/* Search Suggestions Dropdown */}
          {searchQuery.length > 2 && (
            <div className="search-suggestions-dropdown">
              {isSearching ? (
                <div className="search-loading">
                  <div className="spinner-small"></div> Searching...
                </div>
              ) : searchSuggestions.length > 0 ? (
                searchSuggestions.map((file) => (
                  <div
                    key={file.id}
                    className="suggestion-item"
                    onClick={() => {
                      onSearchResultClick?.(file);
                      setSearchQuery(""); // Clear search on selection usage preference
                    }}
                  >
                    <div className="suggestion-icon">
                      {file.isDir ? (
                        <Folder size={20} className="text-blue-500" />
                      ) : (
                        <File size={20} className="text-gray-500" />
                      )}
                    </div>
                    <div className="suggestion-info">
                      <div className="suggestion-name">{file.name}</div>
                      <div className="suggestion-path">
                        {file.path ||
                          (file.parentId === "0" ? "/" : "In folder")}
                      </div>
                    </div>
                    <div className="suggestion-meta">
                      {file.isDir ? "Folder" : "File"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-suggestions">
                  No results found for "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="user-info">
        <div
          className="user-dropdown-container"
          ref={dropdownRef}
          onClick={() => {
            setDropdownVisible(!dropdownVisible);
            if (window.innerWidth <= 768 && !dropdownVisible) {
              setSidebarVisible(false);
            }
          }}
        >
          <span className="user-username-header">
            {profile.name || username}
          </span>
          <div className="user-avatar-small" style={{ color: "white" }}>
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                className="user-avatar-img"
                alt="User"
              />
            ) : (
              <span className="user-avatar-initial">
                {(profile.name || username).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <ChevronDown
            size={16}
            className={`dropdown-arrow ${dropdownVisible ? "rotated" : ""}`}
          />

          {dropdownVisible && (
            <div className="user-dropdown-menu">
              <div
                className="dropdown-user-header"
                onClick={() => setDropdownVisible(false)}
              >
                <div className="dropdown-username">@{username}</div>
                <div className="dropdown-email">{profile.email}</div>
                <div className="dropdown-fullname">{profile.name}</div>
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  setProfileModalVisible(true);
                  setDropdownVisible(false);
                }}
              >
                <User size={16} /> Profile
              </div>
              <div
                className="dropdown-item"
                onClick={() => {
                  toggleTheme();
                  setDropdownVisible(false);
                  if (window.innerWidth <= 768) setSidebarVisible(false);
                }}
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </div>
              <div className="dropdown-divider" />
              <div
                className="dropdown-item logout"
                onClick={() => {
                  onLogout();
                  setDropdownVisible(false);
                }}
              >
                <LogOut size={16} /> Logout
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
