"use client";

import type { ValidationEntry } from "@/lib/groups-types";

interface ValidationBarProps {
  validation: ValidationEntry[];
  onReseed: () => void;
  onExport: () => void;
}

export function ValidationBar({
  validation,
  onReseed,
  onExport,
}: ValidationBarProps) {
  const halt = validation.filter((v) => v.severity === "halt");
  const warn = validation.filter((v) => v.severity === "warn");
  const info = validation.filter((v) => v.severity === "info");

  const firstHalt = halt[0];

  return (
    <div className="sticky top-0 z-10 bg-white border border-stone-200 rounded-lg px-4 py-2 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-sm">
          {halt.length > 0 ? (
            <span className="flex items-center gap-1 text-red-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {halt.length} halt
            </span>
          ) : (
            <span className="flex items-center gap-1 text-green-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              All groups OK
            </span>
          )}
          {warn.length > 0 && (
            <span className="flex items-center gap-1 text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {warn.length} warn
            </span>
          )}
          {info.length > 0 && (
            <span className="flex items-center gap-1 text-stone-500">
              <span className="w-2 h-2 rounded-full bg-stone-400" />
              {info.length} info
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            className="text-xs px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200"
          >
            Export CSV
          </button>
          <button
            onClick={() => {
              if (
                confirm(
                  "Re-seed will repack all non-locked groups from the seed clusters. Continue?",
                )
              ) {
                onReseed();
              }
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-stone-800 text-white hover:bg-stone-900"
          >
            Re-seed
          </button>
        </div>
      </div>
      {firstHalt && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {firstHalt.message}
          {halt.length > 1 && (
            <span className="text-red-500"> (+{halt.length - 1} more)</span>
          )}
        </div>
      )}
    </div>
  );
}
