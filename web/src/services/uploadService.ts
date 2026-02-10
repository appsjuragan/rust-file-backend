import { request, getAuthToken } from "./httpClient";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";
const DEFAULT_CHUNK_SIZE = 7 * 1024 * 1024; // 7MB
const CHUNK_SIZE = Number(import.meta.env.VITE_CHUNK_SIZE) || DEFAULT_CHUNK_SIZE;

export const uploadService = {
    // Normal / multipart upload for smaller files
    uploadFile: async (file: File, parentId?: string, onProgress?: (percent: number) => void) => {
        // CHUNK_SIZE used here for threshold calculation logic if needed, but mainly for chunked upload
        const THRESHOLD = 90 * 1024 * 1024; // 90MB

        if (file.size > THRESHOLD) {
            return uploadService.uploadFileChunked(file, parentId, onProgress);
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

    // Chunked upload for large files
    uploadFileChunked: async (file: File, parentId?: string, onProgress?: (percent: number) => void) => {
        // Use module-level CHUNK_SIZE
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
    }
};
