const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
    listFiles: (parentId?: string, limit?: number, offset?: number) => {
        const queryParams = new URLSearchParams();
        if (parentId) queryParams.set('parent_id', parentId);
        if (limit !== undefined) queryParams.set('limit', limit.toString());
        if (offset !== undefined) queryParams.set('offset', offset.toString());

        const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
        return request(`/files${query}`);
    },
    searchFiles: (params: {
        q: string,
        regex?: boolean,
        wildcard?: boolean,
        similarity?: boolean,
        start_date?: string,
        end_date?: string,
        limit?: number,
        offset?: number
    }) => {
        const queryParams = new URLSearchParams();
        queryParams.set('search', params.q);
        if (params.regex) queryParams.set('regex', 'true');
        if (params.wildcard) queryParams.set('wildcard', 'true');
        if (params.similarity) queryParams.set('similarity', 'true');
        if (params.start_date) queryParams.set('start_date', params.start_date);
        if (params.end_date) queryParams.set('end_date', params.end_date);
        if (params.limit !== undefined) queryParams.set('limit', params.limit.toString());
        if (params.offset !== undefined) queryParams.set('offset', params.offset.toString());

        return request(`/files?${queryParams.toString()}`);
    },
    uploadFile: async (file: File, parentId?: string, onProgress?: (percent: number) => void) => {
        const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
        const THRESHOLD = 90 * 1024 * 1024; // 90MB

        if (file.size > THRESHOLD) {
            return api.uploadFileChunked(file, parentId, onProgress);
        }

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append('file', file);
            if (parentId && parentId !== '0') {
                formData.append('parent_id', parentId);
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

    uploadFileChunked: async (file: File, parentId?: string, onProgress?: (percent: number) => void) => {
        const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
        const file_name = file.name;
        const file_type = file.type || 'application/octet-stream';
        const total_size = file.size;

        // 1. Init Upload
        const initRes = await request('/files/upload/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_name,
                file_type,
                total_size,
            }),
        });
        const { upload_id, chunk_size, key } = initRes;

        // 2. Upload Chunks
        const totalChunks = Math.ceil(total_size / CHUNK_SIZE);
        let uploaded = 0;

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, total_size);
            const chunk = file.slice(start, end);
            const partNumber = i + 1;

            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', `${BASE_URL}/files/upload/${upload_id}/chunk/${partNumber}`);

                const token = getAuthToken();
                if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

                // Track progress
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable && onProgress) {
                        const chunkLoaded = e.loaded;
                        const totalUploaded = uploaded + chunkLoaded;
                        const percent = Math.min(Math.round((totalUploaded / total_size) * 100), 99);
                        onProgress(percent);
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) resolve(null);
                    else reject(new Error(`Chunk upload failed: ${xhr.responseText}`));
                };
                xhr.onerror = () => reject(new Error('Network error during chunk upload'));

                xhr.send(chunk);
            });
            uploaded += (end - start);
            if (onProgress) onProgress(Math.min(Math.round((uploaded / total_size) * 100), 99));
        }

        // 3. Complete Upload
        const completeRes = await request(`/files/upload/${upload_id}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                parent_id: parentId && parentId !== '0' ? parentId : null
            }),
        });

        if (onProgress) onProgress(100);
        return completeRes;
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
    getDownloadTicket: (id: string) => request(`/files/${id}/ticket`, { method: 'POST' }),
    getDownloadUrl: (ticket: string) => `${BASE_URL}/download/${ticket}`,
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
        if (!path) return '';
        // If it's a full URL already
        if (path.startsWith('http')) return path;
        // Prepend BASE_URL
        return `${BASE_URL}${path}`;
    },
    getValidationRules: () => request('/system/validation-rules'),
};

