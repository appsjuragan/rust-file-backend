import { useEffect, useRef, MutableRefObject } from "react";
import type { FileSystemType } from "../../../../lib/types";

/**
 * Hook to poll for file scan status and alert on infected files.
 */
export function useFileScanPolling(
  fsRef: MutableRefObject<FileSystemType>,
  currentFolderRef: MutableRefObject<string>,
  fetchFiles: (parentId: string, silent?: boolean) => Promise<void>,
) {
  const alertedInfectedFiles = useRef<Set<string>>(new Set());
  const scanningFilesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => {
      const currentFs = fsRef.current;
      const activeScans = currentFs.filter(
        (f) => f.scanStatus === "pending" || f.scanStatus === "scanning",
      );
      const hasInfected = currentFs.some((f) => f.scanStatus === "infected");

      if (activeScans.length > 0 || hasInfected) {
        fetchFiles(currentFolderRef.current, true);
      }

      const currentScanningIds = new Set(activeScans.map((f) => f.id));
      scanningFilesRef.current.forEach((id) => {
        if (!currentScanningIds.has(id)) {
          scanningFilesRef.current.delete(id);
        }
      });
      activeScans.forEach((f) => scanningFilesRef.current.add(f.id));

      const infectedFiles = currentFs.filter(
        (f) => f.scanStatus === "infected",
      );
      const newInfectedFiles = infectedFiles.filter(
        (f) => !alertedInfectedFiles.current.has(f.id),
      );

      if (newInfectedFiles.length > 0) {
        newInfectedFiles.forEach((f) => {
          alert(
            `🚨 MALWARE DETECTED: The file "${f.name}" has been flagged as infected and will be deleted.`,
          );
          alertedInfectedFiles.current.add(f.id);
        });
        fetchFiles(currentFolderRef.current, true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchFiles, fsRef, currentFolderRef]);
}
