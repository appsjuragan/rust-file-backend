const API_URL = import.meta.env.VITE_API_URL || "/api";

export const getAuthToken = () => localStorage.getItem('token');
export const setAuthToken = (token: string) => localStorage.setItem('token', token);
export const clearAuthToken = () => localStorage.removeItem('token');

interface RequestOptions extends RequestInit {
    headers?: Record<string, string>;
}

export async function request(endpoint: string, options: RequestOptions = {}) {
    const token = getAuthToken();
    const headers = { ...options.headers };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    // Handle 401 Unauthorized globally if needed (e.g. redirect to login)
    if (res.status === 401) {
        // Optional: clearAuthToken(); window.location.reload();
    }

    const contentType = res.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || "Request failed");
        return data;
    } else {
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || "Request failed");
        }
        return res; // Return response for blobs/non-json
    }
}
