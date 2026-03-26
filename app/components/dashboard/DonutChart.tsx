"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ChartConfig } from "@/lib/types";

const COLORS = [
  "#D4A27F",
  "#E8C4A0",
  "#C4956A",
  "#B07D56",
  "#F0D9C4",
  "#A6674E",
  "#D9B99B",
  "#C9A882",
  "#E0CCBB",
  "#8B5E3C",
];

const TOOLTIP_STYLE = {
  background: "#fffbf7",
  border: "1px solid #e7e5e4",
  borderRadius: "12px",
  fontSize: "13px",
};

export function DonutChart({ config }: { config: ChartConfig }) {
  const total = config.data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
      <h3 className="text-lg font-semibold text-stone-700 mb-4">
        {config.title}
      </h3>
      <div className="flex flex-col lg:flex-row items-center gap-4">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={config.data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={110}
              paddingAngle={2}
              dataKey="value"
            >
              {config.data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: unknown, name: unknown) => [
                `${value} (${total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)`,
                name as string,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-2 justify-center lg:flex-col lg:gap-1">
          {config.data.map((entry, index) => (
            <div key={entry.name} className="flex items-center gap-2 text-sm">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-stone-600">
                {entry.name}{" "}
                <span className="text-stone-400">
                  ({total > 0 ? Math.round((entry.value / total) * 100) : 0}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
