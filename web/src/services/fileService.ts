import { request } from "./httpClient";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const fileService = {
  listFiles: (
    parentId?: string,
    limit?: number,
    offset?: number,
    isFavorite?: boolean,
  ) => {
    const queryParams = new URLSearchParams();
    if (parentId) queryParams.set("parent_id", parentId);
    if (limit !== undefined) queryParams.set("limit", limit.toString());
    if (offset !== undefined) queryParams.set("offset", offset.toString());
    if (isFavorite !== undefined)
      queryParams.set("is_favorite", isFavorite.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    return request(`/files${query}`);
  },

  searchFiles: (params: {
    q: string;
    regex?: boolean;
    wildcard?: boolean;
    similarity?: boolean;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }) => {
    const queryParams = new URLSearchParams();
    queryParams.set("search", params.q);
    if (params.regex) queryParams.set("regex", "true");
    if (params.wildcard) queryParams.set("wildcard", "true");
    if (params.similarity) queryParams.set("similarity", "true");
    if (params.start_date) queryParams.set("start_date", params.start_date);
    if (params.end_date) queryParams.set("end_date", params.end_date);
    if (params.limit !== undefined)
      queryParams.set("limit", params.limit.toString());
    if (params.offset !== undefined)
      queryParams.set("offset", params.offset.toString());

    return request(`/files?${queryParams.toString()}`);
  },

  createFolder: (name: string, parentId?: string) =>
    request("/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        parent_id: parentId === "0" ? null : parentId,
      }),
    }),

  deleteItem: (id: string) =>
    request(`/files/${id}`, {
      method: "DELETE",
    }),

  restoreItem: (id: string) =>
    request(`/files/${id}/restore`, {
      method: "POST",
    }),

  renameItem: (id: string, name?: string, parentId?: string) =>
    request(`/files/${id}/rename`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent_id: parentId }),
    }),

  getDownloadUrl: (ticket: string) => `${BASE_URL}/download/${ticket}`,

  getDownloadTicket: (id: string) =>
    request(`/files/${id}/ticket`, { method: "POST" }),

  getFolderPath: (id: string) => request(`/files/${id}/path`),

  getZipContents: (id: string) => request(`/files/${id}/zip-contents`),

  preCheck: (full_hash: string, size: number) =>
    request("/pre-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_hash, size }),
    }),

  linkFile: (storage_file_id: string, filename: string, parentId?: string) =>
    request("/files/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storage_file_id,
        filename,
        parent_id: parentId === "0" ? null : parentId,
      }),
    }),

  bulkDeleteItem: (ids: string[]) =>
    request("/files/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: ids }),
    }),

  bulkMove: (ids: string[], newParentId: string) =>
    request("/files/bulk-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_ids: ids,
        parent_id: newParentId === "0" ? null : newParentId,
      }),
    }),

  bulkCopy: (ids: string[], newParentId: string) =>
    request("/files/bulk-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_ids: ids,
        parent_id: newParentId === "0" ? null : newParentId,
      }),
    }),

  listFolderTree: () => request("/folders/tree"),

  toggleFavorite: (id: string) =>
    request(`/files/${id}/favorite`, { method: "POST" }),

  getValidationRules: () => request("/system/validation-rules"),

  // ── Sharing ──────────────────────────────────────────
  createShare: (params: {
    user_file_id: string;
    share_type: "public" | "user" | "group";
    shared_with_user_id?: string;
    shared_with_group_id?: string;
    password?: string;
    permission: "view" | "download";
    expires_in_hours: number;
  }) =>
    request("/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  listShares: (userFileId?: string) => {
    const q = userFileId ? `?user_file_id=${userFileId}` : "";
    return request(`/shares${q}`);
  },

  searchUsersForSharing: (query: string) =>
    request(`/shares/users/search?q=${encodeURIComponent(query)}`),

  revokeShare: (shareId: string) =>
    request(`/shares/${shareId}`, { method: "DELETE" }),

  getShareLogs: (shareId: string) => request(`/shares/${shareId}/logs`),

  getPublicShare: (token: string) => {
    const jwt = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
    return fetch(`${BASE_URL}/share/${token}`, { headers }).then((r) => r.json());
  },

  verifySharePassword: (token: string, password: string) => {
    const jwt = localStorage.getItem("token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
    return fetch(`${BASE_URL}/share/${token}/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify({ password }),
    }).then((r) => r.json());
  },

  getShareDownloadUrl: (token: string) => {
    const jwt = localStorage.getItem("token");
    return `${BASE_URL}/share/${token}/download${jwt ? `?auth_token=${jwt}` : ""}`;
  },

  getShareThumbnailUrl: (token: string, fileId?: string) => {
    const jwt = localStorage.getItem("token");
    let url = `${BASE_URL}/share/${token}/thumbnail`;
    const params = new URLSearchParams();
    if (fileId) params.append("file_id", fileId);
    if (jwt) params.append("auth_token", jwt);
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  },

  listSharedFolder: (token: string) => {
    const jwt = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
    return fetch(`${BASE_URL}/share/${token}/list`, { headers }).then((r) => r.json());
  },

  // ── Bulk Download ───────────────────────────────────────
  bulkDownload: (itemIds: string[]) =>
    request("/files/bulk-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: itemIds }),
    }),

  getArchiveStatus: (archiveId: string) =>
    request(`/files/archive/${archiveId}/status`),

  getFolderStats: (id: string) => request(`/files/${id}/stats`),

  emptyTrash: (id: string) => request(`/trash/${id}/empty`, { method: "DELETE" }),
};
