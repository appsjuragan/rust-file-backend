import React, { useState, useEffect, useRef } from "react";
import { Filter, X, Check } from "lucide-react";
import { SearchFilters } from "../../../../../lib/types/Types";
import "./SearchFilter.css";

interface SearchFilterProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

export const SearchFilter: React.FC<SearchFilterProps> = ({
  filters,
  onFiltersChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleRegexChange = () => {
    onFiltersChange({
      ...filters,
      regex: !filters.regex,
      wildcard: false,
      similarity: false,
    });
  };

  const handleWildcardChange = () => {
    onFiltersChange({
      ...filters,
      wildcard: !filters.wildcard,
      regex: false,
      similarity: false,
    });
  };

  const handleSimilarityChange = () => {
    onFiltersChange({
      ...filters,
      similarity: !filters.similarity,
      regex: false,
      wildcard: false,
    });
  };

  const handleDateChange = (
    field: "start_date" | "end_date",
    value: string,
  ) => {
    onFiltersChange({
      ...filters,
      [field]: value ? new Date(value).toISOString() : undefined,
    });
  };

  const handleSizeChange = (field: "min_size" | "max_size", value: string) => {
    const numVal = value ? parseInt(value) : undefined;
    onFiltersChange({ ...filters, [field]: numVal });
  };

  const activeFilterCount = [
    filters.regex,
    filters.wildcard,
    filters.similarity,
    filters.min_size !== undefined,
    filters.max_size !== undefined,
    filters.start_date,
    filters.end_date,
    filters.tags,
    filters.category,
  ].filter(Boolean).length;

  return (
    <div className="search-filter-container" ref={dropdownRef}>
      <button
        className={`search-filter-btn ${isOpen || activeFilterCount > 0 ? "active" : ""
          }`}
        onClick={() => setIsOpen(!isOpen)}
        title="Advanced Search Filters"
      >
        <Filter size={18} />
        {activeFilterCount > 0 && (
          <span className="filter-badge">{activeFilterCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="search-filter-dropdown">
          <div className="filter-section">
            <h4>Search Mode</h4>
            <div className="checkbox-group">
              <label
                className={`filter-checkbox ${filters.regex ? "checked" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={!!filters.regex}
                  onChange={handleRegexChange}
                />
                <span className="checkmark">
                  {filters.regex && <Check size={12} />}
                </span>
                Regex
              </label>
              <label
                className={`filter-checkbox ${filters.wildcard ? "checked" : ""
                  }`}
              >
                <input
                  type="checkbox"
                  checked={!!filters.wildcard}
                  onChange={handleWildcardChange}
                />
                <span className="checkmark">
                  {filters.wildcard && <Check size={12} />}
                </span>
                Wildcard (*)
              </label>
              <label
                className={`filter-checkbox ${filters.similarity ? "checked" : ""
                  }`}
              >
                <input
                  type="checkbox"
                  checked={!!filters.similarity}
                  onChange={handleSimilarityChange}
                />
                <span className="checkmark">
                  {filters.similarity && <Check size={12} />}
                </span>
                Smart Match
              </label>
            </div>
          </div>

          <div className="filter-divider" />

          <div className="filter-section">
            <h4>Date Modified</h4>
            <div className="date-inputs">
              <div className="input-group">
                <label>After</label>
                <input
                  type="date"
                  value={
                    filters.start_date ? filters.start_date.split("T")[0] : ""
                  }
                  onChange={(e) =>
                    handleDateChange("start_date", e.target.value)
                  }
                />
              </div>
              <div className="input-group">
                <label>Before</label>
                <input
                  type="date"
                  value={filters.end_date ? filters.end_date.split("T")[0] : ""}
                  onChange={(e) => handleDateChange("end_date", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="filter-divider" />

          <div className="filter-section">
            <h4>Size (Bytes)</h4>
            <div className="size-inputs">
              <input
                type="number"
                placeholder="Min"
                value={filters.min_size || ""}
                onChange={(e) => handleSizeChange("min_size", e.target.value)}
              />
              <span>-</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.max_size || ""}
                onChange={(e) => handleSizeChange("max_size", e.target.value)}
              />
            </div>
          </div>

          <div className="filter-divider" />

          <div className="filter-section">
            <h4>Attributes</h4>
            <div className="input-group">
              <label>Tags (comma separated)</label>
              <input
                type="text"
                placeholder="work, pending..."
                value={filters.tags || ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    tags: e.target.value || undefined,
                  })
                }
              />
            </div>
            <div className="input-group">
              <label>Category</label>
              <select
                value={filters.category || ""}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    category: (e.target.value || undefined) as SearchFilters["category"],
                  })
                }
              >
                <option value="">Any</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="document">Document</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="filter-actions">
            <button
              className="clear-filters-btn"
              onClick={() => onFiltersChange({})}
            >
              Clear All
            </button>
            <button
              className="apply-filters-btn"
              onClick={() => setIsOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
