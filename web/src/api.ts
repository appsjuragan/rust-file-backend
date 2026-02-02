const BASE_URL = 'http://localhost:3000';

export const getAuthToken = () => localStorage.getItem('jwtToken');
export const setAuthToken = (token: string) => localStorage.setItem('jwtToken', token);
export const clearAuthToken = () => localStorage.removeItem('jwtToken');

async function request(path: string, options: RequestInit = {}) {
    const token = getAuthToken();
    const headers = new Headers(options.headers || {});

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        clearAuthToken();
        window.location.reload();
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Request failed');
    }

    if (response.status === 204) return null;

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return response.json();
    }
    return response.text();
}

export const api = {
    login: (body: any) => request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }),
    register: (body: any) => request('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }),
    listFiles: (parentId?: string) => {
        const query = parentId ? `?parent_id=${parentId}` : '';
        return request(`/files${query}`);
    },
    uploadFile: (file: File, parentId?: string, onProgress?: (percent: number) => void, totalSize?: number) => {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append('file', file);
            if (parentId && parentId !== '0') {
                formData.append('parent_id', parentId);
            }
            if (totalSize) {
                formData.append('total_size', totalSize.toString());
            }

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    onProgress(percent);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        resolve(xhr.responseText);
                    }
                } else {
                    let errorMessage = 'Upload failed';
                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        errorMessage = xhr.statusText || errorMessage;
                    }
                    reject(new Error(errorMessage));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

            xhr.open('POST', `${BASE_URL}/upload`);
            const token = getAuthToken();
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
            xhr.send(formData);
        });
    },
    createFolder: (name: string, parentId?: string) => request('/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_id: parentId === '0' ? null : parentId }),
    }),
    deleteItem: (id: string) => request(`/files/${id}`, {
        method: 'DELETE',
    }),
    renameItem: (id: string, name?: string, parentId?: string) => request(`/files/${id}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_id: parentId }),
    }),
    getFileUrl: (id: string) => `${BASE_URL}/files/${id}?token=${getAuthToken()}`,
    preCheck: (full_hash: string, size: number) => request('/pre-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_hash, size }),
    }),
    linkFile: (storage_file_id: string, filename: string, parentId?: string) => request('/files/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_file_id, filename, parent_id: parentId === '0' ? null : parentId }),
    }),
    getFolderPath: (id: string) => request(`/files/${id}/path`),
    getZipContents: (id: string) => request(`/files/${id}/zip-contents`),
    getSettings: () => request('/settings'),
    updateSettings: (settings: { theme?: string, view_style?: string }) => request('/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    }),
    bulkDeleteItem: (ids: string[]) => request('/files/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: ids }),
    }),
    bulkMove: (ids: string[], newParentId: string) => request('/files/bulk-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: ids, parent_id: newParentId === '0' ? null : newParentId }),
    }),
    getProfile: () => request('/users/me'),
    getUserFacts: () => request('/users/me/facts'),
    updateProfile: (body: { email?: string, name?: string, password?: string }) => request('/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }),
    uploadAvatar: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return request('/users/me/avatar', {
            method: 'POST',
            body: formData,
        });
    },
    getAvatarUrl: (path?: string) => {
        const effectivePath = path || '/users/me/avatar';
        const separator = effectivePath.includes('?') ? '&' : '?';
        return `${BASE_URL}${effectivePath}${separator}token=${getAuthToken()}`;
    },
};

