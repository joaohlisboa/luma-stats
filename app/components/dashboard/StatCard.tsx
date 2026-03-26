import type { StatCardConfig } from "@/lib/types";

export function StatCard({ config }: { config: StatCardConfig }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
      <p className="text-sm text-stone-500 uppercase tracking-wide font-medium">
        {config.title}
      </p>
      <p className="text-4xl font-bold text-stone-800 mt-1">{config.value}</p>
      {config.subtitle && (
        <p className="text-sm text-stone-400 mt-1">{config.subtitle}</p>
      )}
    </div>
  );
}
