"use client";

import { useState } from "react";
import type { Candidate } from "@/lib/types";
import type {
  SecondaryDotConfig,
  TechnicalConstraint,
} from "@/lib/groups-types";
import { MemberChip } from "./MemberChip";

interface UnassignedPoolProps {
  candidateIds: string[];
  candidatesById: Map<string, Candidate>;
  techConstraint: TechnicalConstraint;
  secondaryDot?: SecondaryDotConfig;
  teamMentionColumn?: string | null;
  onDrop: (candidateId: string) => void;
  onMoveToGroup: (candidateId: string) => void;
}

export function UnassignedPool({
  candidateIds,
  candidatesById,
  techConstraint,
  secondaryDot,
  teamMentionColumn,
  onDrop,
  onMoveToGroup,
}: UnassignedPoolProps) {
  const [open, setOpen] = useState(candidateIds.length > 0);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const id = e.dataTransfer.getData("text/candidate-id");
        if (id) onDrop(id);
      }}
      className={`bg-white rounded-xl border border-stone-200 ${dragOver ? "ring-2 ring-stone-300" : ""}`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2 text-left"
      >
        <span className="text-sm font-semibold text-stone-700">
          Unassigned <span className="text-stone-400 font-normal">({candidateIds.length})</span>
        </span>
        <span className="text-stone-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {candidateIds.length === 0 ? (
            <div className="text-xs text-stone-400 italic px-2 py-1">
              Everyone&apos;s placed. Drop members here to release them from a group.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
              {candidateIds.map((id) => {
                const c = candidatesById.get(id);
                if (!c) return null;
                return (
                  <MemberChip
                    key={id}
                    candidate={c}
                    techConstraint={techConstraint}
                    secondaryDot={secondaryDot}
                    teamMentionColumn={teamMentionColumn}
                    onDragStart={() => {}}
                    onClick={() => onMoveToGroup(id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
