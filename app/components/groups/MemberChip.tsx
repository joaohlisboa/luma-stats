"use client";

import type { Candidate } from "@/lib/types";
import type {
  SecondaryDotConfig,
  TechnicalConstraint,
} from "@/lib/groups-types";

interface MemberChipProps {
  candidate: Candidate;
  techConstraint: TechnicalConstraint;
  secondaryDot?: SecondaryDotConfig;
  onDragStart: (id: string) => void;
  onClick: () => void;
}

function techDotColor(c: Candidate, tc: TechnicalConstraint): string {
  const v = String(c[tc.dimensionKey] ?? "");
  if (tc.technicalValues.includes(v)) return "bg-blue-500";
  if (tc.mixedValues.includes(v)) return "bg-amber-400";
  return "bg-stone-400";
}

function secondaryDotStyle(
  c: Candidate,
  cfg: SecondaryDotConfig,
): { color: string; label: string } {
  const v = String(c[cfg.dimensionKey] ?? "");
  const match = cfg.values.find((entry) => entry.value === v);
  if (match) {
    return { color: match.color, label: match.label || match.value };
  }
  return {
    color: cfg.fallbackColor || "#d6d3d1",
    label: v ? v : "unknown",
  };
}

function roleShort(c: Candidate): string {
  for (const key of Object.keys(c)) {
    if (key === "roleRaw" || (key.endsWith("Raw") && /role/i.test(key))) {
      const v = String(c[key] || "");
      if (v) return v.length > 30 ? v.slice(0, 30) + "…" : v;
    }
  }
  const role = c["role"];
  return role ? String(role) : "";
}

export function MemberChip({
  candidate,
  techConstraint,
  secondaryDot,
  onDragStart,
  onClick,
}: MemberChipProps) {
  const secondary = secondaryDot
    ? secondaryDotStyle(candidate, secondaryDot)
    : null;
  const titleParts: string[] = [candidate.name];
  if (secondary) {
    titleParts.push(`${secondaryDot?.label ?? "Tag"}: ${secondary.label}`);
  }
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/candidate-id", candidate.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(candidate.id);
      }}
      onClick={onClick}
      className="group flex items-center gap-2 px-2 py-1.5 rounded-md bg-stone-50 hover:bg-stone-100 cursor-grab active:cursor-grabbing border border-stone-100 transition-colors"
      title={titleParts.join(" · ")}
    >
      <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
        <span
          className={`w-2 h-2 rounded-full ${techDotColor(candidate, techConstraint)}`}
        />
        {secondary && (
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: secondary.color }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-stone-700 truncate">
          {candidate.name}
        </div>
        {roleShort(candidate) && (
          <div className="text-[10px] text-stone-400 truncate">{roleShort(candidate)}</div>
        )}
      </div>
    </div>
  );
}
