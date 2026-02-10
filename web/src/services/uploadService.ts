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
        const CONCURRENCY = 3; // Number of parallel uploads

        // Track progress per chunk to calculate total progress correctly across parallel requests
        const chunkProgress = new Map<number, number>();
        let completedChunks = 0;

        const uploadChunk = async (chunkIndex: number, retryCount = 0) => {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, total_size);
            const chunk = file.slice(start, end);
            const partNumber = chunkIndex + 1;
            const MAX_RETRIES = 3;

            try {
                return await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('PUT', `${BASE_URL}/files/upload/${upload_id}/chunk/${partNumber}`);

                    const token = getAuthToken();
                    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

                    // Track progress
                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable && onProgress) {
                            chunkProgress.set(chunkIndex, e.loaded);
                            const totalLoaded = Array.from(chunkProgress.values()).reduce((a, b) => a + b, 0);
                            const percent = Math.min(Math.round((totalLoaded / total_size) * 100), 99);
                            onProgress(percent);
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            chunkProgress.set(chunkIndex, end - start); // Ensure full size is recorded on completion
                            resolve(null);
                        } else {
                            reject(new Error(`Chunk upload failed with status ${xhr.status}: ${xhr.responseText}`));
                        }
                    };
                    xhr.onerror = () => reject(new Error('Network error during chunk upload'));
                    xhr.onabort = () => reject(new Error('Chunk upload aborted'));

                    xhr.send(chunk);
                });
            } catch (error) {
                if (retryCount < MAX_RETRIES) {
                    console.warn(`Retrying chunk ${partNumber} (attempt ${retryCount + 1})...`);
                    // Exponential backoff: 1s, 2s, 4s
                    await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 1000));
                    return uploadChunk(chunkIndex, retryCount + 1);
                }
                throw error;
            }
        };

        // Execution Queue
        const queue = Array.from({ length: totalChunks }, (_, i) => i);
        const workers = Array(Math.min(CONCURRENCY, totalChunks)).fill(null).map(async () => {
            while (queue.length > 0) {
                const chunkIndex = queue.shift();
                if (chunkIndex !== undefined) {
                    await uploadChunk(chunkIndex);
                }
            }
        });

        await Promise.all(workers);

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
