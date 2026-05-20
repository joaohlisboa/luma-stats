"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { Candidate, FieldSchema, TriageDimension } from "@/lib/types";

const BADGE_PALETTES = [
  "bg-indigo-100 text-indigo-700",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-cyan-100 text-cyan-700",
  "bg-yellow-100 text-yellow-700",
  "bg-pink-100 text-pink-700",
  "bg-slate-100 text-slate-700",
  "bg-red-100 text-red-700",
  "bg-stone-100 text-stone-500",
];

/** Find the raw value for a field matching a pattern */
function findRaw(c: Candidate, pattern: RegExp): string {
  for (const key of Object.keys(c)) {
    if (key.endsWith("Raw") && pattern.test(key)) {
      const val = String(c[key] || "");
      if (val) return val;
    }
  }
  return "";
}

/** Find the classified value for a field matching a pattern */
function findClassified(c: Candidate, fields: FieldSchema[], pattern: RegExp): string {
  for (const f of fields) {
    if (f.source === "classified" && pattern.test(f.key)) {
      const val = String(c[f.key] || "");
      if (val) return val;
    }
  }
  return "";
}

interface EditableBadgeProps {
  value: string;
  options: string[];
  badgeClass: string;
  onChange: (next: string) => void;
}

function EditableBadge({ value, options, badgeClass, onChange }: EditableBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const allOptions = useMemo(() => {
    const set = new Set(options);
    if (value) set.add(value);
    return [...set].sort();
  }, [options, value]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass} hover:ring-2 hover:ring-stone-300 transition`}
        title="Click to reassign"
      >
        {value}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 left-0 min-w-[160px] max-h-64 overflow-auto bg-white border border-stone-200 rounded-lg shadow-lg py-1">
          {allOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                if (opt !== value) onChange(opt);
                setOpen(false);
              }}
              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-stone-100 ${
                opt === value ? "font-semibold text-stone-800" : "text-stone-600"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface CandidateTableProps {
  candidates: Candidate[];
  fields: FieldSchema[];
  triageDimensions: TriageDimension[];
  onSetOverride: (candidateId: string, fieldKey: string, value: string) => void;
}

export function CandidateTable({
  candidates,
  fields,
  triageDimensions,
  onSetOverride,
}: CandidateTableProps) {
  const [search, setSearch] = useState("");
  const [filterField, setFilterField] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState<string | null>(null);

  const filterableFields = fields.filter(
    (f) => f.render === "filter" && f.source === "classified"
  );

  // Canonical categories per field — prefers the triage dimensions list
  // (so reassign options stay consistent even when a bucket is empty).
  const categoriesByField = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of filterableFields) {
      const fromDim = triageDimensions.find((d) => d.key === f.key)?.categories;
      const values = new Set<string>(fromDim || []);
      for (const c of candidates) {
        const v = c[f.key];
        if (v) values.add(String(v));
      }
      map[f.key] = [...values].sort();
    }
    return map;
  }, [candidates, filterableFields, triageDimensions]);

  // Build color maps for classified fields
  const colorMaps = useMemo(() => {
    const maps: Record<string, Record<string, string>> = {};
    for (const f of filterableFields) {
      const sorted = categoriesByField[f.key] || [];
      maps[f.key] = {};
      sorted.forEach((v, i) => {
        maps[f.key][v] = BADGE_PALETTES[i % BADGE_PALETTES.length];
      });
    }
    return maps;
  }, [filterableFields, categoriesByField]);

  const activeFieldCategories = useMemo(() => {
    if (!filterField) return [];
    const counts: Record<string, number> = {};
    for (const c of candidates) {
      const v = String(c[filterField] || "");
      if (v) counts[v] = (counts[v] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [candidates, filterField]);

  const filtered = useMemo(() => {
    let list = candidates;

    if (filterField && filterValue) {
      list = list.filter((c) => String(c[filterField]) === filterValue);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => {
        const searchable = [
          c.name,
          c.email,
          findRaw(c, /role/i),
          findRaw(c, /work|company|study/i),
          ...filterableFields.map((f) => String(c[f.key] || "")),
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(q);
      });
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [candidates, filterField, filterValue, search, filterableFields]);

  return (
    <div className="space-y-4">
      {/* Filter field selector */}
      {filterableFields.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setFilterField(null);
              setFilterValue(null);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !filterField
                ? "bg-stone-800 text-white"
                : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-100"
            }`}
          >
            All ({candidates.length})
          </button>
          {filterableFields.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                if (filterField === f.key) {
                  setFilterField(null);
                  setFilterValue(null);
                } else {
                  setFilterField(f.key);
                  setFilterValue(null);
                }
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterField === f.key
                  ? "bg-stone-800 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Category chips for active filter */}
      {filterField && activeFieldCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFieldCategories.map(([val, count]) => (
            <button
              key={val}
              onClick={() =>
                setFilterValue(filterValue === val ? null : val)
              }
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                filterValue === val
                  ? "bg-stone-700 text-white"
                  : `${colorMaps[filterField]?.[val] || "bg-stone-100 text-stone-600"} hover:opacity-80`
              }`}
            >
              {val} ({count})
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        placeholder="Search name, role, company..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md px-3 py-2 rounded-lg border border-stone-200 text-sm text-stone-700 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300"
      />

      <p className="text-xs text-stone-400">
        {filtered.length} result{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Table — Name, Role, Company, then category badges */}
      <div className="bg-white rounded-xl border border-stone-100 shadow-sm overflow-x-auto overflow-y-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50">
              <th className="text-left px-4 py-3 font-medium text-stone-500 w-[180px]">
                Name
              </th>
              <th className="text-left px-4 py-3 font-medium text-stone-500 w-[140px]">
                Role
              </th>
              <th className="text-left px-4 py-3 font-medium text-stone-500 w-[140px]">
                Company
              </th>
              {filterableFields.map((f) => (
                <th
                  key={f.key}
                  className="text-left px-4 py-3 font-medium text-stone-500 whitespace-nowrap"
                >
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const roleRaw = findRaw(c, /role/i);
              const companyRaw = findRaw(c, /organization|work|company|empres|study|estud/i);

              return (
                <tr
                  key={c.id}
                  className="border-b border-stone-50 hover:bg-stone-50/50"
                >
                  <td className="px-4 py-2.5 font-medium text-stone-800">
                    {c.linkedinUrl ? (
                      <a
                        href={c.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        {c.name}
                      </a>
                    ) : (
                      c.name
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-stone-600 text-xs">
                    <div
                      className="max-w-[140px] truncate"
                      title={roleRaw || undefined}
                    >
                      {roleRaw || "\u2014"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-stone-600 text-xs">
                    <div
                      className="max-w-[140px] truncate"
                      title={companyRaw || undefined}
                    >
                      {companyRaw || "\u2014"}
                    </div>
                  </td>
                  {filterableFields.map((f) => {
                    const raw = c[f.key];
                    const val = raw ? String(raw) : "";
                    const options = categoriesByField[f.key] || [];
                    const badgeClass =
                      colorMaps[f.key]?.[val] || "bg-stone-100 text-stone-500";
                    return (
                      <td key={f.key} className="px-4 py-2.5">
                        <EditableBadge
                          value={val || "\u2014"}
                          options={options}
                          badgeClass={badgeClass}
                          onChange={(next) => onSetOverride(c.id, f.key, next)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
