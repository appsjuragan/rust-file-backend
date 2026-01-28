const BASE_URL = 'http://127.0.0.1:3000';

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
    uploadFile: (file: File, parentId?: string, onProgress?: (percent: number) => void) => {
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
                    reject(new Error(xhr.statusText || 'Upload failed'));
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
};
