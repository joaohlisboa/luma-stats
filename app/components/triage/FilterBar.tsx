"use client";

import type { TriageDimension } from "@/lib/types";

export type SortBy = "score" | "name" | "date";

interface FilterBarProps {
  statusFilter: string;
  onStatusFilter: (s: string) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  sortBy: SortBy;
  onSort: (s: SortBy) => void;
  dimensions: TriageDimension[];
  activeDimension: string | null;
  activeCategory: string | null;
  onDimensionCategory: (dim: string | null, cat: string | null) => void;
  resultCount: number;
}

export function FilterBar({
  statusFilter,
  onStatusFilter,
  searchQuery,
  onSearch,
  sortBy,
  onSort,
  dimensions,
  activeDimension,
  activeCategory,
  onDimensionCategory,
  resultCount,
}: FilterBarProps) {
  const statuses = [
    ["all", "All"],
    ["pending_approval", "Pending"],
    ["approved", "Approved"],
    ["declined", "Declined"],
  ];

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Status segmented control */}
        <div className="flex rounded-lg border border-stone-200 overflow-hidden">
          {statuses.map(([value, label]) => (
            <button
              key={value}
              onClick={() => onStatusFilter(value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === value
                  ? "bg-stone-800 text-white"
                  : "bg-white text-stone-600 hover:bg-stone-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search name, email, company..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-stone-200 text-sm text-stone-700 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300"
        />

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => onSort(e.target.value as SortBy)}
          className="px-3 py-1.5 rounded-lg border border-stone-200 text-sm text-stone-600 bg-white focus:outline-none focus:ring-2 focus:ring-stone-300"
        >
          <option value="score">Score</option>
          <option value="name">Name A-Z</option>
          <option value="date">Newest</option>
        </select>

        <span className="text-xs text-stone-400 ml-auto">
          {resultCount} result{resultCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Dimension filter chips */}
      {dimensions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {dimensions.map((dim) => (
            <div key={dim.key} className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium mr-1">
                {dim.label}:
              </span>
              {dim.categories.map((cat) => {
                const isActive =
                  activeDimension === dim.key && activeCategory === cat;
                return (
                  <button
                    key={`${dim.key}-${cat}`}
                    onClick={() =>
                      onDimensionCategory(
                        isActive ? null : dim.key,
                        isActive ? null : cat
                      )
                    }
                    className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                      isActive
                        ? "bg-stone-700 text-white"
                        : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
