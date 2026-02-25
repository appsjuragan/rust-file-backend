import React, { useEffect, useState, useCallback, useRef } from "react";
import { ReactFileManager, AvatarCropModal } from "../../../lib";
import { fileService } from "../../services/fileService";
import { userService } from "../../services/userService";
import { formatFriendlyError } from "../../utils/errorFormatter";
import type { FileSystemType, FileType, FolderNode } from "../../../lib/types";
import { mapApiFileToFileType } from "../../../lib/utils/fileMappers";
import { useMediaQuery } from "../../../lib/hooks/useMediaQuery";
import "./Dashboard.css";

// Components
import { DashboardHeader } from "./components/Header/DashboardHeader";
import { ProfileModal } from "./components/Modals/ProfileModal";
import { OverwriteConfirmModal } from "./components/Modals/OverwriteConfirmModal";

// Hooks
import { useFileUpload } from "./hooks/useFileUpload";

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const [fs, setFs] = useState<FileSystemType>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string>(() => {
    return localStorage.getItem("currentFolder") || "0";
  });
  const [favorites, setFavorites] = useState<FileType[]>([]);

  // User Profile State
  const [profile, setProfile] = useState<{
    id: string;
    name?: string;
    email?: string;
    avatarUrl?: string;
  }>({ id: "", name: "", email: "", avatarUrl: "" });
  const [username, setUsername] = useState(
    localStorage.getItem("username") || "User"
  );
  const [userFacts, setUserFacts] = useState<any>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<FileType[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Pagination State
  const [hasMoreFiles, setHasMoreFiles] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);

  // UI State
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark"
  );
  const [dropdownVisible, setDropdownVisible] = useState(false);

  // Responsive State
  const isDesktop = useMediaQuery("(min-width: 769px)");
  const [sidebarVisible, setSidebarVisible] = useState(isDesktop);

  // Sync sidebar visibility with media query changes
  useEffect(() => {
    setSidebarVisible(isDesktop);
  }, [isDesktop]);

  // Modals
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  // Refs
  const validationRulesRef = useRef<any>(null);
  const fsRef = useRef(fs);
  const currentFolderRef = useRef(currentFolder);
  const alertedInfectedFiles = useRef<Set<string>>(new Set());
  const scanningFilesRef = useRef<Set<string>>(new Set());

  // Sync Refs
  useEffect(() => {
    fsRef.current = fs;
  }, [fs]);
  useEffect(() => {
    currentFolderRef.current = currentFolder;
  }, [currentFolder]);

  // Data Fetching
  const [chunkSize, setChunkSize] = useState<number>(7 * 1024 * 1024); // Default 7MB

  // Data Fetching
  const fetchValidationRules = useCallback(async () => {
    if (validationRulesRef.current) return validationRulesRef.current;
    try {
      const rules = await fileService.getValidationRules();
      validationRulesRef.current = rules;
      if (rules && rules.chunk_size) {
        setChunkSize(rules.chunk_size);
      }
      return rules;
    } catch (e) {
      console.error("Failed to fetch validation rules", e);
      return {};
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const data = await userService.getProfile();
      const BASE = import.meta.env.VITE_API_URL || "/api";
      // Check if avatar_url is absolute or relative
      const avatar = data.avatar_url
        ? data.avatar_url.startsWith("http")
          ? data.avatar_url
          : data.avatar_url.startsWith("/")
            ? `${BASE}${data.avatar_url}`
            : userService.getAvatar(data.id)
        : undefined;

      setProfile({
        id: data.id,
        name: data.name,
        email: data.email,
        avatarUrl: avatar,
      });

      // Pre-fill edit fields
      setEditName(data.name || "");
      setEditEmail(data.email || "");

      if (data.username) setUsername(data.username);
    } catch (err) {
      console.error("Failed to fetch profile", err);
    }
  }, []);

  const fetchUserFacts = useCallback(async () => {
    try {
      const facts = await userService.getUserFacts();
      setUserFacts(facts);
    } catch (err) {
      console.error("Failed to fetch user facts", err);
    }
  }, []);

  const fetchFolderTree = useCallback(async () => {
    try {
      const data = await fileService.listFolderTree();
      setFolderTree(data);
    } catch (err) {
      console.error("Failed to fetch folder tree", err);
    }
  }, []);

  const fetchFavorites = useCallback(async () => {
    try {
      const data = await fileService.listFiles(undefined, 24, 0, true);
      const mappedFavorites: FileType[] = data.map(mapApiFileToFileType);
      setFavorites(mappedFavorites);
    } catch (err) {
      console.error("Failed to fetch favorites:", err);
    }
  }, []);

  const fetchFiles = useCallback(
    async (parentId: string = "0", silent = false, offset = 0) => {
      if (!silent && offset === 0) setLoading(true);
      if (offset > 0) setLoadingMore(true);

      try {
        const limit = 50;
        // Handle effective parent ID logic
        let effectiveParentId = parentId;
        // Additional verification logic could go here

        const data = await fileService.listFiles(
          effectiveParentId === "0" ? undefined : effectiveParentId,
          limit,
          offset
        );

        const mappedFs: FileSystemType = data.map(mapApiFileToFileType);

        setHasMoreFiles(data.length === limit);

        setFs((prevFs: FileSystemType) => {
          let newFs;
          if (offset === 0) {
            // Filter out files that are already in this folder OR have the same ID as incoming files (moved/updated)
            const incomingIds = new Set(mappedFs.map((f) => f.id));
            newFs = prevFs.filter(
              (f) =>
                (f.parentId || "0") !== effectiveParentId &&
                !incomingIds.has(f.id) &&
                f.id !== "0"
            );
          } else {
            newFs = [...prevFs];
          }

          const existingIds = new Set(newFs.map((f) => f.id));
          const uniqueNewItems = mappedFs.filter((f) => !existingIds.has(f.id));
          newFs = [...newFs, ...uniqueNewItems];

          if (!newFs.some((f) => f.id === "0")) {
            newFs.unshift({ id: "0", name: "/", isDir: true, path: "/" });
          }
          return newFs;
        });
      } catch (err: any) {
        console.error("Failed to fetch files:", err);
      } finally {
        if (!silent) setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Search Effect
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length > 2) {
        setIsSearching(true);
        try {
          const results = await fileService.searchFiles({
            q: searchQuery,
            limit: 10,
          });
          const mappedResults: FileType[] = results.map((item: any) => ({
            id: item.id,
            name: item.filename,
            isDir: item.is_folder,
            parentId: item.parent_id || "0",
            lastModified: new Date(item.created_at).getTime() / 1000,
            scanStatus: item.scan_status,
            size: item.size,
            mimeType: item.mime_type,
            hash: item.hash,
            extraMetadata: item.extra_metadata,
            isFavorite: item.is_favorite,
            path: item.path,
            isEncrypted: item.is_encrypted,
          }));
          setSearchSuggestions(mappedResults);
        } catch (error) {
          console.error("Search failed", error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchSuggestions([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Hooks Usage (must be after fetchFiles definition)
  const refreshAll = useCallback(
    async (parentId: string = "0", silent = false) => {
      await Promise.all([
        fetchFiles(parentId, silent),
        fetchUserFacts(),
        fetchFolderTree(),
        fetchFavorites(),
      ]);
    },
    [fetchFiles, fetchUserFacts, fetchFolderTree, fetchFavorites]
  );

  const {
    activeUploads,
    setActiveUploads,
    onUpload,
    cancelUpload,
    overwriteConfirm,
    setOverwriteConfirm,
  } = useFileUpload(refreshAll, fsRef, chunkSize);

  // Initial Load & Auth Effects - Run only once on mount
  useEffect(() => {
    userService
      .getSettings()
      .then((settings: any) => {
        if (settings && settings.theme) setTheme(settings.theme);
      })
      .catch(console.error);

    fetchProfile();
    fetchUserFacts();
    fetchValidationRules();
    fetchFavorites();
  }, [fetchProfile, fetchUserFacts, fetchValidationRules, fetchFavorites]);

  // Data Fetching Effect - Run when currentFolder changes
  useEffect(() => {
    localStorage.setItem("currentFolder", currentFolder);
    fetchFiles(currentFolder);
    fetchFolderTree();
  }, [currentFolder, fetchFiles, fetchFolderTree]);

  // Polling & Updates
  useEffect(() => {
    const interval = setInterval(fetchUserFacts, 60000);
    return () => clearInterval(interval);
  }, [fetchUserFacts]);

  // File Scanning Polling
  useEffect(() => {
    const interval = setInterval(() => {
      const currentFs = fsRef.current;
      const activeScans = currentFs.filter(
        (f) => f.scanStatus === "pending" || f.scanStatus === "scanning"
      );
      // Also poll if there are infected files (to catch when they are auto-deleted)
      const hasInfected = currentFs.some((f) => f.scanStatus === "infected");

      if (activeScans.length > 0 || hasInfected) {
        fetchFiles(currentFolderRef.current, true);
      }

      const currentScanningIds = new Set(activeScans.map((f) => f.id));
      scanningFilesRef.current.forEach((id) => {
        if (!currentScanningIds.has(id)) {
          scanningFilesRef.current.delete(id);
        }
      });
      activeScans.forEach((f) => scanningFilesRef.current.add(f.id));

      const infectedFiles = currentFs.filter(
        (f) => f.scanStatus === "infected"
      );
      const newInfectedFiles = infectedFiles.filter(
        (f) => !alertedInfectedFiles.current.has(f.id)
      );

      if (newInfectedFiles.length > 0) {
        newInfectedFiles.forEach((f) => {
          alert(
            `🚨 MALWARE DETECTED: The file "${f.name}" has been flagged as infected and will be deleted.`
          );
          alertedInfectedFiles.current.add(f.id);
        });
        fetchFiles(currentFolderRef.current, true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchFiles]);

  // Theme Effect
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

  // Folder Navigation History handling
  const isInternalNavigation = useRef(false);
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.currentFolder !== undefined) {
        isInternalNavigation.current = true;
        setCurrentFolder(e.state.currentFolder);
      }
    };

    // Initialize history state on first load if not set
    if (
      !window.history.state ||
      window.history.state.currentFolder === undefined
    ) {
      window.history.replaceState(
        { ...window.history.state, currentFolder },
        ""
      );
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const sidebarNavigatingRef = useRef(false);

  useEffect(() => {
    if (isInternalNavigation.current) {
      isInternalNavigation.current = false;
      return;
    }

    // Only push if different from current history state to avoid duplicates
    if (window.history.state?.currentFolder !== currentFolder) {
      // If the sidebar is currently open on mobile, it already has a history entry.
      // When we navigate, we "consume" that entry by replacing it with the new folder state
      // and clearing the sidebarId. This prevents the back() call in sidebar cleanup
      // from reverting the folder navigation.
      if (window.history.state?.sidebarId) {
        window.history.replaceState(
          { ...window.history.state, currentFolder, sidebarId: undefined },
          ""
        );
        sidebarNavigatingRef.current = true;
      } else {
        window.history.pushState(
          { ...window.history.state, currentFolder },
          ""
        );
      }
    }
  }, [currentFolder]);

  // Back button handling for Sidebar on Mobile
  const sidebarVisibleRef = useRef(sidebarVisible);
  useEffect(() => {
    sidebarVisibleRef.current = sidebarVisible;
  }, [sidebarVisible]);

  /**
   * Wrapped navigation handler that ensures history state is correctly
   * updated before the mobile sidebar is closed, preventing race conditions.
   */
  const navigateToFolder = useCallback(
    (id: string) => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile && sidebarVisibleRef.current) {
        if (window.history.state?.sidebarId) {
          // Pre-emptively update history to "consume" the sidebar entry
          window.history.replaceState(
            {
              ...window.history.state,
              currentFolder: id,
              sidebarId: undefined,
            },
            ""
          );
          sidebarNavigatingRef.current = true;
        }
      }
      setCurrentFolder(id);
    },
    [setCurrentFolder]
  );

  useEffect(() => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile && sidebarVisible) {
      const stateId = `sidebar-${Math.random().toString(36).substr(2, 9)}`;
      window.history.pushState(
        { ...window.history.state, sidebarId: stateId },
        ""
      );
      sidebarNavigatingRef.current = false;

      const handlePopState = (e: PopStateEvent) => {
        if (sidebarVisibleRef.current && e.state?.sidebarId !== stateId) {
          setSidebarVisible(false);
        }
      };

      const timer = setTimeout(() => {
        window.addEventListener("popstate", handlePopState);
      }, 50);

      return () => {
        clearTimeout(timer);
        window.removeEventListener("popstate", handlePopState);

        // Only go back in history if we are NOT in the middle of a folder navigation
        // that already consumed/replaced the sidebar's history entry.
        if (
          window.history.state?.sidebarId === stateId &&
          !sidebarNavigatingRef.current
        ) {
          window.history.back();
        }
        sidebarNavigatingRef.current = false;
      };
    }
  }, [sidebarVisible]);

  // Handlers
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    userService.updateSettings({ theme: newTheme }).catch(console.error);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Reset input value IMMEDIATELY so re-selecting same file works
        e.target.value = "";

        setImageToCrop(dataUrl);
        // Small delay to ensure state and focus transitions are smooth on mobile
        setTimeout(() => {
          setCropModalVisible(true);
        }, 100);
      };
      reader.onerror = () => {
        console.error("FileReader error occurred while loading avatar");
        e.target.value = "";
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    try {
      await userService.updateProfile({
        name: editName || undefined,
        email: editEmail || undefined,
        password: editPassword || undefined,
      });
      await fetchProfile();
      setProfileModalVisible(false);
    } catch (err: any) {
      alert(formatFriendlyError(err.message));
    }
  };

  const handleCropSave = async (croppedBlob: Blob) => {
    try {
      const file = new File([croppedBlob], "avatar.jpg", {
        type: "image/jpeg",
      });
      await userService.uploadAvatar(file);
      await fetchProfile();
      setCropModalVisible(false);
      setImageToCrop(null);
    } catch (err: any) {
      alert(formatFriendlyError(err.message));
    }
  };

  return (
    <div className="app-container">
      <DashboardHeader
        profile={profile}
        username={username}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        dropdownVisible={dropdownVisible}
        setDropdownVisible={setDropdownVisible}
        setProfileModalVisible={setProfileModalVisible}
        sidebarVisible={sidebarVisible}
        setSidebarVisible={setSidebarVisible}
        theme={theme}
        toggleTheme={toggleTheme}
        onLogout={onLogout}
        searchSuggestions={searchSuggestions}
        isSearching={isSearching}
        onSearchResultClick={(file) => {
          if (file.isDir) {
            navigateToFolder(file.id);
          } else {
            if (file.parentId) {
              navigateToFolder(file.parentId);
              setHighlightedId(file.id);
            }
          }
          if (window.innerWidth <= 768) setSidebarVisible(false);
        }}
      />

      <main
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ReactFileManager
          fs={fs}
          onRefresh={(id: string) => fetchFiles(id)}
          setCurrentFolder={navigateToFolder}
          currentFolder={currentFolder}
          onUpload={onUpload}
          onCancelUpload={cancelUpload}
          onCreateFolder={async (n: string) => {
            await fileService.createFolder(
              n,
              currentFolder === "0" ? undefined : currentFolder
            );
            refreshAll(currentFolder);
          }}
          onDelete={async (id: string) => {
            await fileService.deleteItem(id);
            refreshAll(currentFolder);
          }}
          onBulkDelete={async (ids: string[]) => {
            await fileService.bulkDeleteItem(ids);
            refreshAll(currentFolder);
          }}
          onRename={async (id: string, n: string) => {
            await fileService.renameItem(id, n);
            refreshAll(currentFolder);
          }}
          onMove={async (id: string, pid: string) => {
            await fileService.renameItem(id, undefined, pid);
            refreshAll(currentFolder);
          }}
          onBulkMove={async (ids: string[], pid: string) => {
            await fileService.bulkMove(ids, pid);
            refreshAll(currentFolder);
          }}
          onBulkCopy={async (ids: string[], pid: string) => {
            await fileService.bulkCopy(ids, pid);
            refreshAll(currentFolder);
          }}
          activeUploads={activeUploads}
          setActiveUploads={setActiveUploads}
          userFacts={userFacts}
          onLoadMore={async () => {
            const count = fs.filter(
              (f) => (f.parentId || "0") === currentFolder
            ).length;
            await fetchFiles(currentFolder, true, count);
          }}
          hasMore={hasMoreFiles}
          isLoadingMore={loadingMore}
          highlightedId={highlightedId}
          setHighlightedId={setHighlightedId}
          folderTree={folderTree}
          refreshFolderTree={fetchFolderTree}
          sidebarVisible={sidebarVisible}
          setSidebarVisible={setSidebarVisible}
          userId={profile.id}
          favorites={favorites}
          onToggleFavorite={async (file) => {
            const filesArray = Array.isArray(file) ? file : [file];
            // If all items are already favorites, we are in "Remove from Favorites" mode.
            // Otherwise, we are in "Add to Favorites" mode.
            const allSelectedAreFavorites = filesArray.every(
              (f) => f.isFavorite
            );

            if (allSelectedAreFavorites) {
              // Removing: toggle all (they are all favorites)
              await Promise.all(
                filesArray.map((f) => fileService.toggleFavorite(f.id))
              );
            } else {
              // Adding: only toggle those that are NOT yet favorites
              const toAdd = filesArray.filter((f) => !f.isFavorite);
              await Promise.all(
                toAdd.map((f) => fileService.toggleFavorite(f.id))
              );
            }

            // Optimistically refresh
            fetchFiles(currentFolder, true);
            fetchFavorites();
          }}
        />
      </main>

      <ProfileModal
        isVisible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        profile={profile}
        username={username}
        editName={editName}
        setEditName={setEditName}
        editEmail={editEmail}
        setEditEmail={setEditEmail}
        editPassword={editPassword}
        setEditPassword={setEditPassword}
        onSave={handleSaveProfile}
        onAvatarChange={handleAvatarChange}
      />

      {overwriteConfirm && (
        <OverwriteConfirmModal
          isVisible={!!overwriteConfirm}
          fileName={overwriteConfirm.fileName}
          onCancel={() => {
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            overwriteConfirm.resolve(false);
            setOverwriteConfirm(null);
          }}
          onConfirm={() => {
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            overwriteConfirm.resolve(true);
            setOverwriteConfirm(null);
          }}
        />
      )}

      {imageToCrop && (
        <AvatarCropModal
          isVisible={cropModalVisible}
          imageSrc={imageToCrop}
          onClose={() => {
            setCropModalVisible(false);
            setImageToCrop(null);
          }}
          onCropComplete={handleCropSave}
        />
      )}
    </div>
  );
}
