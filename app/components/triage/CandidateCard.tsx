"use client";

import { useState } from "react";
import type { Candidate, FieldSchema } from "@/lib/types";
import { ScoreBadge } from "./ScoreBadge";

interface CandidateCardProps {
  candidate: Candidate;
  decision: string;
  fields: FieldSchema[];
  onApprove: () => void;
  onDecline: () => void;
  onClear: () => void;
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Find the raw value for a field that looks like a role or workplace */
function findRaw(c: Candidate, pattern: RegExp): string {
  for (const key of Object.keys(c)) {
    if (key.endsWith("Raw") && pattern.test(key)) {
      const val = String(c[key] || "");
      if (val) return val;
    }
  }
  return "";
}

export function CandidateCard({
  candidate: c,
  decision,
  fields,
  onApprove,
  onDecline,
  onClear,
}: CandidateCardProps) {
  const [expanded, setExpanded] = useState(false);

  const borderColor =
    decision === "approved"
      ? "border-l-green-400"
      : decision === "declined"
        ? "border-l-red-300"
        : "border-l-stone-200";

  // Find role and workplace — both raw and classified
  const roleRaw = findRaw(c, /role/i);
  const workplaceRaw = findRaw(c, /work|company|empres|study|estud/i);

  // Get classified filter fields (for category tags on collapsed card)
  const filterFields = fields.filter(
    (f) => f.render === "filter" && f.source === "classified"
  );

  // Keys already visible on the collapsed card — don't repeat in expanded view
  const cardKeys = new Set([
    "id", "name", "firstName", "lastName", "email",
    "createdAt", "approvalStatus", "linkedinUrl", "relevanceScore",
    "responseQuality",
    ...filterFields.map((f) => f.key),
  ]);
  // Also skip the raw fields already surfaced on the card
  if (roleRaw) {
    const key = Object.keys(c).find((k) => k.endsWith("Raw") && /role/i.test(k));
    if (key) cardKeys.add(key);
  }
  if (workplaceRaw) {
    const key = Object.keys(c).find((k) => k.endsWith("Raw") && /work|company|empres|study|estud/i.test(k));
    if (key) cardKeys.add(key);
  }

  // Build extra fields: everything on the candidate not already on the card
  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));
  const extraFields: { label: string; value: string }[] = [];

  // First: schema-defined fields (in schema order, which is intentional)
  for (const f of fields) {
    if (cardKeys.has(f.key)) continue;
    if (f.render === "hidden") continue;
    const val = c[f.key];
    if (val == null || val === "") continue;
    extraFields.push({ label: f.label, value: String(val) });
    cardKeys.add(f.key); // mark as shown
  }

  // Then: any dynamic candidate keys not in the schema at all
  for (const key of Object.keys(c)) {
    if (cardKeys.has(key)) continue;
    const val = c[key];
    if (val == null || val === "") continue;
    const strVal = String(val);
    if (strVal.length > 200) continue; // skip very long internal data
    // Humanize the camelCase key as a label
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
    extraFields.push({ label, value: strVal });
  }

  return (
    <div
      className={`bg-white rounded-xl border border-stone-100 shadow-sm border-l-4 ${borderColor} overflow-hidden`}
    >
      <div className="p-4 flex items-start gap-3">
        <ScoreBadge score={c.relevanceScore} />
        <div className="flex-1 min-w-0">
          {/* Name */}
          <span className="font-semibold text-stone-800">{c.name}</span>

          {/* Raw role & workplace — always visible */}
          {(roleRaw || workplaceRaw) && (
            <p className="text-sm text-stone-500 mt-0.5 truncate">
              {roleRaw}
              {roleRaw && workplaceRaw && " — "}
              {workplaceRaw}
            </p>
          )}

          {/* Classified category tags */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {filterFields.map((f) => {
              const val = c[f.key];
              if (!val) return null;
              return (
                <span
                  key={f.key}
                  className="text-[11px] text-stone-400 bg-stone-50 px-2 py-0.5 rounded"
                >
                  {String(val)}
                </span>
              );
            })}
            <span className="text-[11px] text-stone-300">
              {formatDate(c.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={decision === "approved" ? onClear : onApprove}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              decision === "approved"
                ? "bg-green-500 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-green-100 hover:text-green-700"
            }`}
          >
            {decision === "approved" ? "Approved" : "Approve"}
          </button>
          <button
            onClick={decision === "declined" ? onClear : onDecline}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              decision === "declined"
                ? "bg-red-500 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-red-100 hover:text-red-700"
            }`}
          >
            {decision === "declined" ? "Declined" : "Decline"}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-2 py-1.5 rounded-lg text-xs text-stone-400 hover:bg-stone-100"
          >
            {expanded ? "\u25B2" : "\u25BC"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-stone-50 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {/* Email — always first */}
            <div>
              <span className="text-stone-400">Email:</span>{" "}
              <span className="text-stone-700">{c.email}</span>
            </div>

            {/* All remaining fields not already on the card */}
            {extraFields.map(({ label, value }) => {
              const isLong = value.length > 60;
              return (
                <div key={label} className={isLong ? "col-span-2" : ""}>
                  <span className="text-stone-400">{label}:</span>{" "}
                  <span className="text-stone-600">{value}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 text-xs">
            {c.linkedinUrl && (
              <a
                href={String(c.linkedinUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                LinkedIn
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
