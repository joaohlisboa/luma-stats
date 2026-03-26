"use client";

import { useState, useMemo } from "react";
import type { ProcessedData, Candidate } from "@/lib/types";
import { useTriage } from "@/lib/use-triage";
import { CandidateCard } from "./CandidateCard";
import { BalanceDashboard } from "./BalanceDashboard";
import { FilterBar, type SortBy } from "./FilterBar";
import { BulkActions } from "./BulkActions";

export function Triage({ data }: { data: ProcessedData }) {
  const {
    isHydrated,
    getDecision,
    setDecision,
    clearDecision,
    bulkApprove,
    bulkDecline,
    resetAll,
    counts,
  } = useTriage(data);

  const [showBalance, setShowBalance] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("score");
  const [activeDimension, setActiveDimension] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = data.candidates;

    if (statusFilter !== "all") {
      list = list.filter((c) => getDecision(c) === statusFilter);
    }

    if (activeDimension && activeCategory) {
      list = list.filter(
        (c) => String(c[activeDimension]) === activeCategory
      );
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => {
        const searchable = [c.name, c.email, ...data.schema.fields
          .filter((f) => f.render !== "hidden")
          .map((f) => String(c[f.key] || ""))
        ].join(" ").toLowerCase();
        return searchable.includes(q);
      });
    }

    list = [...list].sort((a, b) => {
      if (sortBy === "score") return b.relevanceScore - a.relevanceScore;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

    return list;
  }, [data, statusFilter, activeDimension, activeCategory, searchQuery, sortBy, getDecision]);

  const exportCsv = () => {
    const headers = ["id", "name", "email", "decision", "score"];
    const detailKeys = data.schema.fields
      .filter((f) => f.render === "filter" || f.render === "detail")
      .map((f) => f.key);
    const allHeaders = [...headers, ...detailKeys];

    const rows = data.candidates.map((c) => {
      const values = [
        c.id,
        `"${c.name}"`,
        c.email,
        getDecision(c),
        String(c.relevanceScore),
        ...detailKeys.map((k) => `"${String(c[k] || "")}"`)
      ];
      return values.join(",");
    });

    const blob = new Blob(
      [allHeaders.join(",") + "\n" + rows.join("\n")],
      { type: "text/csv" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "triage-decisions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Counts header */}
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="font-semibold text-green-700">
            {counts.approved}
          </span>
          <span className="text-stone-400">approved</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="font-semibold text-amber-700">
            {counts.pending}
          </span>
          <span className="text-stone-400">pending</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="font-semibold text-red-600">
            {counts.declined}
          </span>
          <span className="text-stone-400">declined</span>
        </span>
      </div>

      {/* Balance dashboard (collapsible) */}
      {data.schema.triageDimensions.length > 0 && (
        <div>
          <button
            onClick={() => setShowBalance(!showBalance)}
            className="text-sm font-medium text-stone-500 hover:text-stone-700 mb-2 flex items-center gap-1"
          >
            {showBalance ? "\u25BC" : "\u25B6"} Balance dashboard
          </button>
          {showBalance && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.schema.triageDimensions.map((dim) => (
                <BalanceDashboard
                  key={dim.key}
                  candidates={data.candidates}
                  getDecision={getDecision as (c: Candidate) => string}
                  dimension={dim}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <FilterBar
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        sortBy={sortBy}
        onSort={setSortBy}
        dimensions={data.schema.triageDimensions}
        activeDimension={activeDimension}
        activeCategory={activeCategory}
        onDimensionCategory={(dim, cat) => {
          setActiveDimension(dim);
          setActiveCategory(cat);
        }}
        resultCount={filtered.length}
      />

      {/* Bulk actions */}
      <BulkActions
        filtered={filtered}
        getDecision={getDecision as (c: Candidate) => string}
        onBulkApprove={bulkApprove}
        onBulkDecline={bulkDecline}
        onReset={resetAll}
        onExportCsv={exportCsv}
      />

      {/* Candidate list */}
      <div className="space-y-2">
        {filtered.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            decision={getDecision(c)}
            fields={data.schema.fields}
            onApprove={() => setDecision(c.id, "approved")}
            onDecline={() => setDecision(c.id, "declined")}
            onClear={() => clearDecision(c.id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-stone-400">
            No candidates match these filters.
          </div>
        )}
      </div>
    </div>
  );
}
