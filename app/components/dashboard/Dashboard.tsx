"use client";

import type { ProcessedData, StatCardConfig, ChartConfig } from "@/lib/types";
import { StatCard } from "./StatCard";
import { HorizontalBarChart } from "./HorizontalBarChart";
import { DonutChart } from "./DonutChart";
import { AreaTimelineChart } from "./AreaTimelineChart";

export function Dashboard({ data }: { data: ProcessedData }) {
  const { dashboard } = data.schema;

  // Group stat-cards together for the top row
  const statCards = dashboard.filter(
    (item): item is StatCardConfig => item.type === "stat-card"
  );
  const charts = dashboard.filter(
    (item): item is ChartConfig => item.type !== "stat-card"
  );

  return (
    <div className="space-y-8">
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

      {dashboard.length === 0 && (
        <div className="text-center py-12 text-stone-400">
          No charts configured in this dataset.
        </div>
      )}
    </div>
  );
}
