import React, { useEffect, useState, useCallback } from "react";
import { ReactFileManager, AvatarCropModal } from "../../../lib";
import { fileService } from "../../services/fileService";
import { userService } from "../../services/userService";
import { formatFriendlyError } from "../../utils/errorFormatter";
import { useMediaQuery } from "../../../lib/hooks/useMediaQuery";
import "./Dashboard.css";

// Components
import { DashboardHeader } from "./components/Header/DashboardHeader";
import { ProfileModal } from "./components/Modals/ProfileModal";
import { OverwriteConfirmModal } from "./components/Modals/OverwriteConfirmModal";

// Hooks
import { useFileUpload } from "./hooks/useFileUpload";
import { useDashboardData } from "./hooks/useDashboardData";
import { useTheme } from "./hooks/useTheme";
import { useFolderNavigation } from "./hooks/useFolderNavigation";
import { useSearch } from "./hooks/useSearch";
import { useFileScanPolling } from "./hooks/useFileScanPolling";

interface DashboardProps {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const {
    fs,
    currentFolder,
    setCurrentFolder,
    favorites,
    userFacts,
    folderTree,
    profile,
    username,
    hasMoreFiles,
    loadingMore,
    chunkSize,
    fsRef,
    currentFolderRef,
    fetchValidationRules,
    fetchProfile,
    fetchUserFacts,
    fetchFolderTree,
    fetchFavorites,
    fetchFiles,
    refreshAll,
  } = useDashboardData();

  // Theme
  const { theme, setTheme, toggleTheme } = useTheme();

  // Search
  const { searchQuery, setSearchQuery, searchSuggestions, isSearching } =
    useSearch();

  // UI State
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  // Responsive State
  const isDesktop = useMediaQuery("(min-width: 769px)");
  const [sidebarVisible, setSidebarVisible] = useState(isDesktop);

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

  // Folder Navigation
  const { navigateToFolder } = useFolderNavigation(
    currentFolder,
    setCurrentFolder,
    sidebarVisible,
    setSidebarVisible,
  );

  // File Upload
  const {
    activeUploads,
    setActiveUploads,
    onUpload,
    cancelUpload,
    overwriteConfirm,
    setOverwriteConfirm,
  } = useFileUpload(refreshAll, fsRef, chunkSize);

  // File Scan Polling
  useFileScanPolling(fsRef, currentFolderRef, fetchFiles);

  // Initial Load & Auth Effects
  useEffect(() => {
    userService
      .getSettings()
      .then((settings: any) => {
        if (settings && settings.theme) setTheme(settings.theme);
      })
      .catch(console.error);

    fetchProfile().then((data) => {
      if (data) {
        setEditName(data.name || "");
        setEditEmail(data.email || "");
      }
    });
    fetchUserFacts();
    fetchValidationRules();
    fetchFavorites();
  }, [
    fetchProfile,
    fetchUserFacts,
    fetchValidationRules,
    fetchFavorites,
    setTheme,
  ]);

  // Data Fetching Effect
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

  // Handlers
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        e.target.value = "";
        setImageToCrop(dataUrl);
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
              currentFolder === "0" ? undefined : currentFolder,
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
              (f) => (f.parentId || "0") === currentFolder,
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
            const allSelectedAreFavorites = filesArray.every(
              (f) => f.isFavorite,
            );

            if (allSelectedAreFavorites) {
              await Promise.all(
                filesArray.map((f) => fileService.toggleFavorite(f.id)),
              );
            } else {
              const toAdd = filesArray.filter((f) => !f.isFavorite);
              await Promise.all(
                toAdd.map((f) => fileService.toggleFavorite(f.id)),
              );
            }

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
