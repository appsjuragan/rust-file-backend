export async function scanEntries(
  items: DataTransferItemList | null
): Promise<{ file: File; path: string }[]> {
  if (!items) return [];

  const files: { file: File; path: string }[] = [];

  // Helper to get File object from entry
  const getFileFromEntry = (entry: any): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (entry.file) {
        entry.file(resolve, reject);
      } else {
        resolve(null as any);
      }
    });
  };

  // Helper to read entries from directory
  const readEntries = (dirReader: any): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      dirReader.readEntries(resolve, reject);
    });
  };

  async function traverseEntry(entry: any, parentPath: string = "") {
    if (!entry) return;

    if (entry.isFile) {
      try {
        const file = await getFileFromEntry(entry);
        if (file) {
          const fullPath = parentPath + entry.name;
          // Fix: sometimes entry.name is empty or weird? No, usually fine.
          files.push({ file, path: fullPath });
        }
      } catch (err) {
        console.error("Error reading file entry:", err);
      }
    } else if (entry.isDirectory) {
      const directoryReader = entry.createReader();
      const currentPath = parentPath + entry.name + "/";

      const readAllEntries = async () => {
        let allEntries: any[] = [];
        try {
          while (true) {
            const batch = await readEntries(directoryReader);
            if (!batch || batch.length === 0) break;
            allEntries = allEntries.concat(batch);
          }
        } catch (err) {
          console.error("Error reading directory entries:", err);
        }

        if (allEntries.length > 0) {
          const promises = allEntries.map((subEntry) =>
            traverseEntry(subEntry, currentPath)
          );
          await Promise.all(promises);
        }
      };

      await readAllEntries();
    }
  }

  const entries: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item && item.kind === "file") {
      // Try both standard and webkit prefixed
      const entry =
        typeof item.webkitGetAsEntry === "function"
          ? item.webkitGetAsEntry()
          : typeof (item as any).getAsEntry === "function"
          ? (item as any).getAsEntry()
          : null;

      if (entry) {
        entries.push(entry);
      }
    }
  }

  const entryPromises = entries.map((entry) => traverseEntry(entry, ""));
  await Promise.all(entryPromises);

  return files;
}

export async function scanFiles(
  files: FileList | null
): Promise<{ file: File; path: string }[]> {
  if (!files) return [];
  return Array.from(files).map((file) => ({
    file,
    path: (file as any).webkitRelativePath || file.name,
  }));
}
