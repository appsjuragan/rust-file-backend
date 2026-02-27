const THUMBNAIL_CACHE_NAME = "thumbnail-cache-v1";
const CACHE_EXPIRATION_MS = 3600 * 1000; // 1 hour

/**
 * Checks if a thumbnail for the given fileId is in the cache and not expired.
 */
export async function getCachedThumbnail(fileId: string): Promise<Blob | null> {
    try {
        if (typeof caches === "undefined") return null;

        const cache = await caches.open(THUMBNAIL_CACHE_NAME);
        const requestUrl = `/files/${fileId}/thumbnail`;
        const response = await cache.match(requestUrl);

        if (!response) return null;

        // Check expiration based on custom header or Date header
        const cachedAtStr = response.headers.get("x-cached-at");
        const cachedAt = cachedAtStr ? parseInt(cachedAtStr, 10) : null;

        if (cachedAt) {
            const now = Date.now();
            if (now - cachedAt > CACHE_EXPIRATION_MS) {
                await cache.delete(requestUrl);
                return null;
            }
        }

        return await response.blob();
    } catch (error) {
        console.error("Error accessing thumbnail cache:", error);
        return null;
    }
}

/**
 * Stores a thumbnail response in the cache with a timestamp.
 */
export async function cacheThumbnail(fileId: string, response: Response) {
    try {
        if (typeof caches === "undefined") return;

        const cache = await caches.open(THUMBNAIL_CACHE_NAME);
        const requestUrl = `/files/${fileId}/thumbnail`;

        // Responses from fetch are immutable, so we need to create a new one to add our custom header
        const blob = await response.clone().blob();
        const newResponse = new Response(blob, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers),
        });

        // Add a custom header for expiration tracking
        newResponse.headers.append("x-cached-at", Date.now().toString());

        await cache.put(requestUrl, newResponse);
    } catch (error) {
        console.error("Error updating thumbnail cache:", error);
    }
}
