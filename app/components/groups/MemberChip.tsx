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
  /**
   * Candidate-key holding the raw teammate-mention text (e.g. from a "who
   * are your teammates?" form question). When set, the chip shows a "+N"
   * teammate badge and uses the raw text as the hover tooltip.
   */
  teamMentionColumn?: string | null;
  onDragStart: (id: string) => void;
  onClick: () => void;
}

function techBgClasses(c: Candidate, tc: TechnicalConstraint): string {
  const v = String(c[tc.dimensionKey] ?? "");
  if (tc.technicalValues.includes(v)) return "bg-blue-50 hover:bg-blue-100 border-blue-100";
  if (tc.mixedValues.includes(v)) return "bg-amber-50 hover:bg-amber-100 border-amber-100";
  return "bg-stone-50 hover:bg-stone-100 border-stone-100";
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

function countTeammates(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  if (/^(n\/?a|none|nenhum[ao]?|sozinh[ao]|solo|ainda n[aã]o|n[aã]o tenho|no team|s[oó]|so eu|me)$/i.test(s)) return 0;
  return s
    .split(/[\n,;]+|\s+(?:e|and|&)\s+/i)
    .map((x) => x.trim())
    .filter((x) => x.length > 1).length;
}

function subtitleText(c: Candidate): string {
  const role = String(c["roleRaw"] ?? c["role"] ?? "").trim();
  const company = String(c["organizationRaw"] ?? c["organization"] ?? "").trim();
  const combined = company ? (role ? `${role} @ ${company}` : `@ ${company}`) : role;
  if (!combined) return "";
  return combined.length > 40 ? combined.slice(0, 40) + "…" : combined;
}

export function MemberChip({
  candidate,
  techConstraint,
  secondaryDot,
  teamMentionColumn,
  onDragStart,
  onClick,
}: MemberChipProps) {
  const secondary = secondaryDot
    ? secondaryDotStyle(candidate, secondaryDot)
    : null;
  const submittedTeam = teamMentionColumn
    ? String(candidate[teamMentionColumn] ?? "").trim()
    : "";
  const teammateCount = countTeammates(submittedTeam);
  const subtitle = subtitleText(candidate);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/candidate-id", candidate.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(candidate.id);
      }}
      onClick={onClick}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing border transition-colors ${techBgClasses(candidate, techConstraint)}`}
      title={submittedTeam || undefined}
    >
      {secondary && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: secondary.color }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-stone-700 truncate">
          {candidate.name}
        </div>
        {subtitle && (
          <div className="text-[10px] text-stone-400 truncate">{subtitle}</div>
        )}
      </div>
      {teammateCount > 0 && (
        <span className="flex-shrink-0 text-[10px] font-semibold text-stone-500 bg-stone-200 rounded px-1.5 py-0.5">
          +{teammateCount}
        </span>
      )}
    </div>
  );
}
