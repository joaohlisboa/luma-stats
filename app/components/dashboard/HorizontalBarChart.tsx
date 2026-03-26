"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ChartConfig } from "@/lib/types";

const TOOLTIP_STYLE = {
  background: "#fffbf7",
  border: "1px solid #e7e5e4",
  borderRadius: "12px",
  fontSize: "13px",
};

export function HorizontalBarChart({ config }: { config: ChartConfig }) {
  const color = config.color || "#D4A27F";
  const total = config.data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
      <h3 className="text-lg font-semibold text-stone-700 mb-4">
        {config.title}
      </h3>
      <ResponsiveContainer width="100%" height={config.data.length * 44 + 20}>
        <BarChart
          data={config.data}
          layout="vertical"
          margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#f5f0eb"
            horizontal={false}
          />
          <XAxis type="number" tick={{ fill: "#a8a29e", fontSize: 12 }} />
          <YAxis
            dataKey="name"
            type="category"
            width={160}
            tick={{ fill: "#57534e", fontSize: 13 }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => {
              const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(1) : "0";
              return [`${value} (${pct}%)`, ""];
            }}
          />
          <Bar
            dataKey="value"
            fill={color}
            radius={[0, 6, 6, 0]}
            label={{
              position: "right",
              fill: "#a8a29e",
              fontSize: 12,
              formatter: (value: unknown) =>
                total > 0 ? `${((Number(value) / total) * 100).toFixed(0)}%` : "",
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
