"use client";

import { useState } from "react";
import type { Candidate } from "@/lib/types";
import type { Group } from "@/lib/groups-types";

interface SwapPopoverProps {
  member: Candidate;
  groups: Group[];
  currentGroupId: string | "unassigned";
  candidatesById: Map<string, Candidate>;
  onMove: (toGroupId: string | "unassigned") => void;
  onSwap: (otherCandidateId: string) => void;
  onClose: () => void;
}

export function SwapPopover({
  member,
  groups,
  currentGroupId,
  candidatesById,
  onMove,
  onSwap,
  onClose,
}: SwapPopoverProps) {
  const [mode, setMode] = useState<"main" | "move" | "swap">("main");

  const otherGroups = groups.filter((g) => g.id !== currentGroupId);

  return (
    <div className="absolute z-30 mt-1 left-0 w-72 bg-white border border-stone-200 rounded-lg shadow-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-stone-700 truncate">{member.name}</div>
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-600 text-xs"
        >
          ✕
        </button>
      </div>

      {mode === "main" && (
        <div className="space-y-1">
          <button
            onClick={() => setMode("move")}
            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-stone-50 text-stone-700"
          >
            Move to another group…
          </button>
          <button
            onClick={() => setMode("swap")}
            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-stone-50 text-stone-700"
          >
            Swap with another member…
          </button>
          {currentGroupId !== "unassigned" && (
            <button
              onClick={() => {
                onMove("unassigned");
                onClose();
              }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-stone-50 text-stone-700"
            >
              Move to unassigned
            </button>
          )}
        </div>
      )}

      {mode === "move" && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {otherGroups.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                onMove(g.id);
                onClose();
              }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-stone-50 text-stone-700"
            >
              Group {g.number}
              {g.problem ? ` · ${g.problem}` : ""}
              {" "}
              <span className="text-stone-400">({g.memberIds.length})</span>
            </button>
          ))}
          {currentGroupId !== "unassigned" && (
            <button
              onClick={() => {
                onMove("unassigned");
                onClose();
              }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-stone-50 text-stone-700"
            >
              Unassigned
            </button>
          )}
        </div>
      )}

      {mode === "swap" && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {groups.flatMap((g) =>
            g.memberIds
              .filter((id) => id !== member.id)
              .map((id) => {
                const other = candidatesById.get(id);
                if (!other) return null;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      onSwap(id);
                      onClose();
                    }}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-stone-50 text-stone-700"
                  >
                    <span className="text-stone-400">G{g.number}</span> {other.name}
                  </button>
                );
              }),
          )}
        </div>
      )}
    </div>
  );
}
