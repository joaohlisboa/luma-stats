"use client";

import {
  AreaChart,
  Area,
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

export function AreaTimelineChart({ config }: { config: ChartConfig }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
      <h3 className="text-lg font-semibold text-stone-700 mb-4">
        {config.title}
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart
          data={config.data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f5f0eb" />
          <XAxis
            dataKey="name"
            tick={{ fill: "#a8a29e", fontSize: 12 }}
          />
          <YAxis tick={{ fill: "#a8a29e", fontSize: 12 }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [String(value), ""]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#B07D56"
            fill="#E8C4A0"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
