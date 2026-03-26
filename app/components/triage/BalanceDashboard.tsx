"use client";

import type { Candidate, TriageDimension } from "@/lib/types";

interface BalanceDashboardProps {
  candidates: Candidate[];
  getDecision: (c: Candidate) => string;
  dimension: TriageDimension;
}

function countByKey(
  items: Candidate[],
  key: string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const val = String(item[key] || "Other");
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

export function BalanceDashboard({
  candidates,
  getDecision,
  dimension,
}: BalanceDashboardProps) {
  const approved = candidates.filter(
    (c) => getDecision(c) === "approved"
  );

  const allCounts = countByKey(candidates, dimension.key);
  const approvedCounts = countByKey(approved, dimension.key);
  const allTotal = candidates.length;
  const approvedTotal = approved.length;

  const categories = Object.keys(allCounts).sort(
    (a, b) => allCounts[b] - allCounts[a]
  );

  const data = categories.map((cat) => {
    const poolPct =
      allTotal > 0 ? Math.round((allCounts[cat] / allTotal) * 100) : 0;
    const appPct =
      approvedTotal > 0
        ? Math.round(((approvedCounts[cat] || 0) / approvedTotal) * 100)
        : 0;
    const diff = appPct - poolPct;
    return {
      name: cat,
      pool: poolPct,
      approved: appPct,
      diff,
      poolCount: allCounts[cat],
      approvedCount: approvedCounts[cat] || 0,
    };
  });

  // Scale bars relative to the highest percentage across all categories
  const maxPct = Math.max(...data.flatMap((d) => [d.pool, d.approved]), 1);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
      <h3 className="text-sm font-semibold text-stone-600 mb-3">
        {dimension.label}
        <span className="font-normal text-stone-400 ml-1.5">
          {approvedTotal} approved / {allTotal} total
        </span>
      </h3>
      <div className="space-y-3">
        {data.map((d) => {
          const isOver = d.diff > 10;
          const isUnder = d.diff < -10;
          const diffColor = isOver
            ? "text-red-500"
            : isUnder
              ? "text-amber-500"
              : "text-stone-300";

          return (
            <div key={d.name}>
              {/* Category label + diff */}
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-stone-600 truncate mr-2">
                  {d.name}
                </span>
                <span className={`text-[10px] font-medium ${diffColor} flex-shrink-0`}>
                  {d.diff > 0 ? "+" : ""}{d.diff}pp
                </span>
              </div>
              {/* Paired bars */}
              <div className="space-y-0.5">
                {/* Pool bar */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-stone-300 w-6 text-right flex-shrink-0">All</span>
                  <div className="flex-1 bg-stone-50 rounded h-2.5 overflow-hidden">
                    <div
                      className="h-full bg-stone-300 rounded"
                      style={{ width: `${(d.pool / maxPct) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-stone-400 w-12 text-right flex-shrink-0">
                    {d.pool}%
                    <span className="text-stone-300 ml-0.5">({d.poolCount})</span>
                  </span>
                </div>
                {/* Approved bar */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] w-6 text-right flex-shrink-0" style={{ color: "#22c55e" }}>
                    &#10003;
                  </span>
                  <div className="flex-1 bg-stone-50 rounded h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${(d.approved / maxPct) * 100}%`,
                        backgroundColor: isOver ? "#ef4444" : "#22c55e",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-stone-400 w-12 text-right flex-shrink-0">
                    {d.approved}%
                    <span className="text-stone-300 ml-0.5">({d.approvedCount})</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-3 text-[10px] text-stone-300">
        <span>Gray = pool share</span>
        <span>Green = approved share</span>
        <span>Red = over-represented (&gt;10pp)</span>
      </div>
    </div>
  );
}
