import { useState, useCallback, useRef, useEffect } from "react";
import { fileService } from "../../../services/fileService";
import { userService } from "../../../services/userService";
import type {
  FileSystemType,
  FileType,
  FolderNode,
} from "../../../../lib/types";
import { mapApiFileToFileType } from "../../../../lib/utils/fileMappers";

export function useDashboardData() {
  const [fs, setFs] = useState<FileSystemType>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string>(() => {
    return localStorage.getItem("currentFolder") || "0";
  });
  const [favorites, setFavorites] = useState<FileType[]>([]);
  const [userFacts, setUserFacts] = useState<any>(null);
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);

  // Profile
  const [profile, setProfile] = useState<{
    id: string;
    name?: string;
    email?: string;
    avatarUrl?: string;
    isAdmin?: boolean;
  }>({ id: "", name: "", email: "", avatarUrl: "", isAdmin: false });
  const [username, setUsername] = useState(
    localStorage.getItem("username") || "User",
  );

  // Pagination
  const [hasMoreFiles, setHasMoreFiles] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Sharing Context
  const [currentShareToken, setCurrentShareToken] = useState<string | null>(null);
  const [currentSharePermission, setCurrentSharePermission] = useState<"view" | "download" | null>(null);

  // Chunk size
  const [chunkSize, setChunkSize] = useState<number>(7 * 1024 * 1024);

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
        isAdmin: data.is_admin,
      });

      if (data.username) setUsername(data.username);
      return data;
    } catch (err) {
      console.error("Failed to fetch profile", err);
      return null;
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
        const effectiveParentId = parentId;

        let data;
        let activeShareToken: string | null = null;
        const currentFolderItem = fsRef.current.find((f) => f.id === effectiveParentId);

        if (effectiveParentId === "shared-for-you") {
          // Virtual folder: list shared items for current user
          data = await fileService.listIncomingShares();
          setCurrentShareToken(null);
          setCurrentSharePermission(null);
        } else {
          // Check if this folder is itself a shared item (direct share)
          const sharedItem = fsRef.current.find(
            (f) => f.id === effectiveParentId && f.isShared && f.shareToken
          );

          if (sharedItem?.shareToken) {
            // Top-level shared folder - list using public share API
            activeShareToken = sharedItem.shareToken;
            const activePermission = sharedItem.permission || null;
            setCurrentShareToken(activeShareToken);
            setCurrentSharePermission(activePermission);
            data = await fileService.listSharedFolder(activeShareToken);
          } else {
            // Check if we're already inside a shared tree (token from state)
            const parentInFs = fsRef.current.find((f) => f.id === effectiveParentId);
            const inheritedToken = parentInFs?.shareToken || currentShareToken;
            const inheritedPermission = parentInFs?.permission || currentSharePermission;

            if (inheritedToken && effectiveParentId !== "0") {
              // Inside a shared subfolder - use regular API (owner's files)
              // and tag results with token for further navigation
              activeShareToken = inheritedToken;
              setCurrentShareToken(inheritedToken);
              setCurrentSharePermission(inheritedPermission);
              data = await fileService.listFiles(
                effectiveParentId,
                limit,
                offset,
              );
            } else {
              // Normal owned folder
              setCurrentShareToken(null);
              setCurrentSharePermission(null);
              data = await fileService.listFiles(
                effectiveParentId === "0" ? undefined : effectiveParentId,
                limit,
                offset,
              );
            }
          }
        }

        const mappedFs: FileSystemType = data.map((item: any) => {
          if (effectiveParentId === "shared-for-you") {
            // Map ShareResponse to FileType
            return {
              id: item.user_file_id,
              name: item.filename || "Shared Item",
              isDir: item.is_folder || false,
              parentId: "shared-for-you",
              size: item.size || 0,
              mimeType: item.mime_type,
              lastModified: new Date(item.created_at).getTime() / 1000,
              isShared: true,
              shareToken: item.share_token,
              hasPassword: item.has_password,
              permission: item.permission,
              sharedBy: item.shared_by,
              sharedAt: item.created_at,
              expiresAt: item.expires_at,
            };
          }
          const mapped = mapApiFileToFileType(item);
          if (activeShareToken) {
            mapped.isShared = true;
            mapped.shareToken = activeShareToken;
            mapped.permission = currentSharePermission || undefined;
            // Inherit metadata if in a shared folder
            mapped.sharedAt = currentFolderItem?.sharedAt;
            mapped.sharedBy = currentFolderItem?.sharedBy;
            mapped.expiresAt = currentFolderItem?.expiresAt;
          }
          return mapped;
        });

        setHasMoreFiles(effectiveParentId === "shared-for-you" ? false : data.length === limit);

        setFs((prevFs: FileSystemType) => {
          let newFs;
          if (offset === 0) {
            const incomingIds = new Set(mappedFs.map((f) => f.id));
            newFs = prevFs.filter(
              (f) =>
                (f.parentId || "0") !== effectiveParentId &&
                !incomingIds.has(f.id) &&
                f.id !== "0" &&
                f.id !== "shared-for-you"
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
    [currentShareToken],
  );

  const refreshAll = useCallback(
    async (parentId: string = "0", silent = false) => {
      await Promise.all([
        fetchFiles(parentId, silent),
        fetchUserFacts(),
        fetchFolderTree(),
        fetchFavorites(),
      ]);
    },
    [fetchFiles, fetchUserFacts, fetchFolderTree, fetchFavorites],
  );

  return {
    // State
    fs,
    setFs,
    loading,
    currentFolder,
    setCurrentFolder,
    currentShareToken,
    setCurrentShareToken,
    favorites,
    userFacts,
    folderTree,
    profile,
    setProfile,
    username,
    setUsername,
    hasMoreFiles,
    loadingMore,
    chunkSize,
    // Refs
    fsRef,
    currentFolderRef,
    alertedInfectedFiles,
    scanningFilesRef,
    // Fetchers
    fetchValidationRules,
    fetchProfile,
    fetchUserFacts,
    fetchFolderTree,
    fetchFavorites,
    fetchFiles,
    refreshAll,
  };
}
