export const getCachedWebPImage = async (
    key: string,
): Promise<string | null> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("bing-image-cache", 1);

        request.onerror = () => reject(request.error);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains("images")) {
                db.createObjectStore("images");
            }
        };

        request.onsuccess = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains("images")) {
                resolve(null);
                return;
            }
            const transaction = db.transaction("images", "readonly");
            const store = transaction.objectStore("images");
            const getRequest = store.get(key);

            getRequest.onerror = () => reject(getRequest.error);
            getRequest.onsuccess = () => {
                resolve(getRequest.result ? getRequest.result : null);
            };
        };
    });
};

export const cacheWebPImage = async (
    key: string,
    dataUrl: string,
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("bing-image-cache", 1);

        request.onerror = () => reject(request.error);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains("images")) {
                db.createObjectStore("images");
            }
        };

        request.onsuccess = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains("images")) {
                resolve();
                return;
            }
            const transaction = db.transaction("images", "readwrite");
            const store = transaction.objectStore("images");
            const putRequest = store.put(dataUrl, key);

            putRequest.onerror = () => reject(putRequest.error);
            putRequest.onsuccess = () => resolve();
        };
    });
};
