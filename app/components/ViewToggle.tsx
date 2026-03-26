export type View = "dashboard" | "triage" | "approved";

interface ViewToggleProps {
  active: View;
  onChangeView: (v: View) => void;
  counts: { total: number; approved: number; pending: number; declined: number };
}

const VIEWS: { key: View; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "triage", label: "Triage" },
  { key: "approved", label: "Approved" },
];

export function ViewToggle({ active, onChangeView, counts }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg border border-stone-200 overflow-hidden">
        {VIEWS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChangeView(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              active === key
                ? "bg-stone-800 text-white"
                : "bg-white text-stone-600 hover:bg-stone-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 ml-4 text-sm">
        <span className="text-stone-500 font-medium">{counts.total}</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-green-700 font-medium">{counts.approved}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-amber-700 font-medium">{counts.pending}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-red-600 font-medium">{counts.declined}</span>
        </span>
      </div>
    </div>
  );
}
