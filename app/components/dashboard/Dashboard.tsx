"use client";

import { useMemo, useState } from "react";
import type { ProcessedData, StatCardConfig, ChartConfig } from "@/lib/types";
import { buildDashboard } from "@/lib/dashboard";
import { useTriage } from "@/lib/use-triage";
import { StatCard } from "./StatCard";
import { HorizontalBarChart } from "./HorizontalBarChart";
import { DonutChart } from "./DonutChart";
import { AreaTimelineChart } from "./AreaTimelineChart";

type Filter = "all" | "approved";

export function Dashboard({ data }: { data: ProcessedData }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { getDecision, isHydrated, counts } = useTriage(data);

  const items = useMemo(() => {
    const source =
      filter === "approved"
        ? data.candidates.filter((c) => getDecision(c) === "approved")
        : data.candidates;
    return buildDashboard(source, data.schema.fields);
  }, [filter, data, getDecision]);

  // Avoid hydration mismatch: until triage state loads from localStorage,
  // the "approved" view could differ between SSR and client.
  if (filter === "approved" && !isHydrated) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  const statCards = items.filter(
    (item): item is StatCardConfig => item.type === "stat-card"
  );
  const charts = items.filter(
    (item): item is ChartConfig => item.type !== "stat-card"
  );

  return (
    <div className="space-y-8">
      {/* Filter toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-stone-500 font-medium">Showing</span>
        <div className="flex rounded-lg border border-stone-200 overflow-hidden">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-stone-800 text-white"
                : "bg-white text-stone-600 hover:bg-stone-50"
            }`}
          >
            All ({counts.total})
          </button>
          <button
            onClick={() => setFilter("approved")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === "approved"
                ? "bg-stone-800 text-white"
                : "bg-white text-stone-600 hover:bg-stone-50"
            }`}
          >
            Approved only ({counts.approved})
          </button>
        </div>
      </div>

      {/* Stat cards row */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statCards.map((card) => (
            <StatCard key={card.id} config={card} />
          ))}
        </div>
      )}

      {/* Charts */}
      {charts.map((chart) => {
        switch (chart.type) {
          case "horizontal-bar":
            return <HorizontalBarChart key={chart.id} config={chart} />;
          case "donut":
            return <DonutChart key={chart.id} config={chart} />;
          case "area-timeline":
            return <AreaTimelineChart key={chart.id} config={chart} />;
          default:
            return null;
        }
      })}

      {items.length === 0 && (
        <div className="text-center py-12 text-stone-400">
          {filter === "approved"
            ? "No approved candidates yet."
            : "No charts configured in this dataset."}
        </div>
      )}
    </div>
  );
}
