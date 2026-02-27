import { useState, useEffect } from "react";
import { fileService } from "../../../services/fileService";
import type { FileType } from "../../../../lib/types";

export function useSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<FileType[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length > 2) {
        setIsSearching(true);
        try {
          const results = await fileService.searchFiles({
            q: searchQuery,
            limit: 10,
          });
          const mappedResults: FileType[] = results.map((item: any) => ({
            id: item.id,
            name: item.filename,
            isDir: item.is_folder,
            parentId: item.parent_id || "0",
            lastModified: new Date(item.created_at).getTime() / 1000,
            scanStatus: item.scan_status,
            size: item.size,
            mimeType: item.mime_type,
            hash: item.hash,
            extraMetadata: item.extra_metadata,
            isFavorite: item.is_favorite,
            path: item.path,
            isEncrypted: item.is_encrypted,
          }));
          setSearchSuggestions(mappedResults);
        } catch (error) {
          console.error("Search failed", error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchSuggestions([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    searchSuggestions,
    isSearching,
  };
}
