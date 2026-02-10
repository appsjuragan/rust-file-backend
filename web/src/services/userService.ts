import { request } from "./httpClient";

export const userService = {
    getProfile: () => request('/users/me'),

    updateProfile: (data: { name?: string, email?: string, password?: string }) => request('/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),

    getAvatar: (userId: string) => {
        // This likely returns a URL or Blob, need to check usage. 
        // Based on api.ts usage, it seems it might be returning an endpoint path mostly.
        // But let's keep it consistent.
        // NOTE: The backend returns a redirect or image directly.
        // In the frontend, we usually construct the URL directly.
    },

    uploadAvatar: (file: File) => {
        const formData = new FormData();
        formData.append('avatar', file);
        return request('/users/avatar', {
            method: 'POST',
            body: formData,
        });
    },

    getUserFacts: () => request('/users/facts'),

    getSettings: () => request('/settings'),

    updateSettings: (settings: { theme?: string, view_style?: string }) => request('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    }),
};
