/**
 * IndexedDB helper for resumable uploads.
 * Stores file data as chunks in IndexedDB so uploads can resume after page refresh.
 */

const DB_NAME = "rfm_uploads";
const DB_VERSION = 1;
const STORE_NAME = "file_chunks";
const META_STORE = "upload_meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface UploadMeta {
  uploadId: string;
  fileName: string;
  fileType: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  parentId: string;
  createdAt: number;
}

/**
 * Store file data for a specific upload session
 */
export async function storeFileForUpload(
  uploadId: string,
  file: File,
  meta: UploadMeta
): Promise<void> {
  const db = await openDb();

  // Store metadata
  const metaTx = db.transaction(META_STORE, "readwrite");
  metaTx.objectStore(META_STORE).put(meta, uploadId);
  await new Promise<void>((resolve, reject) => {
    metaTx.oncomplete = () => resolve();
    metaTx.onerror = () => reject(metaTx.error);
  });

  // Store file data in chunks to avoid memory issues with large files
  const chunkSize = meta.chunkSize;
  const totalChunks = meta.totalChunks;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const blob = file.slice(start, end);
    const buffer = await blob.arrayBuffer();

    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(buffer, `${uploadId}_chunk_${i + 1}`);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/**
 * Get a specific chunk's data for upload
 */
export async function getChunkData(
  uploadId: string,
  partNumber: number
): Promise<ArrayBuffer | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const req = tx.objectStore(STORE_NAME).get(`${uploadId}_chunk_${partNumber}`);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get metadata for a specific upload session
 */
export async function getUploadMeta(
  uploadId: string
): Promise<UploadMeta | null> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const req = tx.objectStore(META_STORE).get(uploadId);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all stored upload metadata
 */
export async function getAllUploadMeta(): Promise<
  { id: string; meta: UploadMeta }[]
> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const store = tx.objectStore(META_STORE);

  return new Promise((resolve, reject) => {
    const results: { id: string; meta: UploadMeta }[] = [];
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) {
        results.push({ id: c.key as string, meta: c.value });
        c.continue();
      } else {
        resolve(results);
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

/**
 * Clean up stored data for a completed/failed upload
 */
export async function cleanupUpload(
  uploadId: string,
  totalChunks: number
): Promise<void> {
  const db = await openDb();

  // Remove metadata
  const metaTx = db.transaction(META_STORE, "readwrite");
  metaTx.objectStore(META_STORE).delete(uploadId);
  await new Promise<void>((resolve, reject) => {
    metaTx.oncomplete = () => resolve();
    metaTx.onerror = () => reject(metaTx.error);
  });

  // Remove all chunks
  const tx = db.transaction(STORE_NAME, "readwrite");
  for (let i = 0; i < totalChunks; i++) {
    tx.objectStore(STORE_NAME).delete(`${uploadId}_chunk_${i + 1}`);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
