const API_URL = import.meta.env.VITE_API_URL || "/api";

export const getAuthToken = () => localStorage.getItem("token");
export const setAuthToken = (token: string) =>
  localStorage.setItem("token", token);
export const clearAuthToken = () => localStorage.removeItem("token");

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

// Global callback for request events
let onRequestCallback: (() => void) | null = null;

export const setOnRequestCallback = (callback: (() => void) | null) => {
  onRequestCallback = callback;
};

export async function request(endpoint: string, options: RequestOptions = {}) {
  // Notify that a request is occurring
  if (onRequestCallback) {
    onRequestCallback();
  }
  const token = getAuthToken();
  const headers = { ...options.headers };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearAuthToken();
    localStorage.removeItem("currentFolder");
    localStorage.removeItem("username");
    localStorage.removeItem("theme");
    window.location.reload();
  }

  const contentType = res.headers.get("content-type");
  const isJson = contentType && contentType.indexOf("application/json") !== -1;

  if (isJson) {
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || data.message || "Request failed");
    return data;
  } else {
    // If it's not JSON but we expected success, handle non-JSON success/error
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Request failed");
    }

    // For GET requests that are not JSON, they might be files or unexpected HTML (like Nginx fallback)
    if (options.method === "GET" || !options.method) {
      // Check if it looks like HTML (Nginx try_files fallback)
      const text = await res.clone().text();
      if (text.trim().toLowerCase().startsWith("<!doctype html")) {
        throw new Error(
          "Received HTML instead of JSON. The API endpoint might be misconfigured.",
        );
      }
    }

    return res; // Return response for blobs/non-json
  }
}
