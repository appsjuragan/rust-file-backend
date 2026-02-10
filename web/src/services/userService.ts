import { request } from "./httpClient";

export const userService = {
    getProfile: () => request('/users/me'),

    updateProfile: (data: { name?: string, email?: string, password?: string }) => request('/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),

    getAvatar: (userId: string) => {
        const BASE = import.meta.env.VITE_API_URL || "/api";
        return `${BASE}/users/avatar/${userId}`;
    },

    uploadAvatar: (file: File) => {
        const formData = new FormData();
        formData.append('avatar', file);
        return request('/users/me/avatar', {
            method: 'POST',
            body: formData,
        });
    },

    getUserFacts: () => request('/users/me/facts'),

    getSettings: () => request('/settings'),

    updateSettings: (settings: { theme?: string, view_style?: string }) => request('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    }),
};
