"use client";

import type { Candidate } from "@/lib/types";

interface BulkActionsProps {
  filtered: Candidate[];
  getDecision: (c: Candidate) => string;
  onBulkApprove: (ids: string[]) => void;
  onBulkDecline: (ids: string[]) => void;
  onReset: () => void;
  onExportCsv: () => void;
}

export function BulkActions({
  filtered,
  onBulkApprove,
  onBulkDecline,
  onReset,
  onExportCsv,
}: BulkActionsProps) {
  const ids = filtered.map((c) => c.id);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => {
          if (confirm(`Approve ${ids.length} filtered candidates?`))
            onBulkApprove(ids);
        }}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
      >
        Approve filtered ({ids.length})
      </button>
      <button
        onClick={() => {
          if (confirm(`Decline ${ids.length} filtered candidates?`))
            onBulkDecline(ids);
        }}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
      >
        Decline filtered ({ids.length})
      </button>
      <button
        onClick={() => {
          if (confirm("Reset all triage decisions?")) onReset();
        }}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors"
      >
        Reset all
      </button>
      <button
        onClick={onExportCsv}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors ml-auto"
      >
        Export CSV
      </button>
    </div>
  );
}
