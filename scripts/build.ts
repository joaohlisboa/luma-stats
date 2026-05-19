/**
 * Step 5: Build processed.json — deterministic aggregation and config.
 * No LLM — pure computation from classified + scored data.
 */

import type {
  ProcessedData,
  TriageDimension,
  FieldSchema,
  Candidate,
} from "../lib/types";
import { buildDashboard } from "../lib/dashboard";
import { isSyntheticKey, type CategoryDesign } from "./classify";
import type { ScoreConfig } from "./score";
import type { ParsedCSV } from "./parse";

interface BuildInput {
  parsed: ParsedCSV;
  candidates: Candidate[];
  categoryDesign: CategoryDesign;
  scoreConfig: ScoreConfig;
}

function countBy(candidates: Candidate[], key: string): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  for (const c of candidates) {
    const val = String(c[key] || "Other");
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}

export function buildProcessedData(input: BuildInput): ProcessedData {
  const { parsed, candidates, categoryDesign, scoreConfig } = input;

  // ── Build field schemas ──
  const fields: FieldSchema[] = [];

  // Standard Luma fields
  fields.push({ key: "name", label: "Name", source: "luma", render: "hidden" });
  fields.push({ key: "email", label: "Email", source: "luma", render: "hidden" });
  fields.push({ key: "approvalStatus", label: "Status", source: "luma", render: "hidden" });

  // Classified fields from category design + their raw counterparts
  for (const [col, design] of Object.entries(categoryDesign)) {
    // Classified category → filter
    fields.push({
      key: design.fieldKey,
      label: design.label,
      source: "classified",
      render: "filter",
    });
    // Synthetic fields (gender, technicality) have no underlying CSV column,
    // so no "Raw" companion.
    if (isSyntheticKey(col)) continue;
    // Raw value → detail (shown in expanded cards and tables)
    fields.push({
      key: `${design.fieldKey}Raw`,
      label: `${design.label} (raw)`,
      source: "custom",
      render: "detail",
    });
  }

  // Custom columns not classified (fixed-choice, booleans, text)
  for (const col of parsed.customColumns) {
    const design = categoryDesign[col];
    if (design) continue; // already handled as classified

    const values = parsed.uniqueValues[col] || [];
    if (values.length === 0) continue;

    // Generate a camelCase key
    const key = col
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
      .join("");

    if (!key) continue;

    const isUrl = values.some((v) => v.startsWith("http"));
    const isBoolean = values.every((v) =>
      ["yes", "no", "true", "false", "sim", "não"].includes(v.toLowerCase())
    );
    const isLegal = col.toLowerCase().includes("terms") || col.toLowerCase().includes("newsletter");
    const isLongText = values.some((v) => v.length > 50) || values.length > 30;
    const isMotivation = col.toLowerCase().includes("why") || col.toLowerCase().includes("interested") ||
      col.toLowerCase().includes("motivation") || col.toLowerCase().includes("tell us");

    if (isLegal) {
      fields.push({ key, label: col, source: "custom", render: "hidden" });
    } else if (isUrl) {
      fields.push({ key, label: col, source: "custom", render: "hidden" });
    } else if (isMotivation || isLongText) {
      fields.push({ key, label: col, source: "custom", render: "detail" });
    } else if (isBoolean) {
      fields.push({ key, label: col, source: "custom", render: "filter" });
    } else if (values.length <= 10) {
      fields.push({ key, label: col, source: "custom", render: "filter" });
    } else {
      fields.push({ key, label: col, source: "custom", render: "detail" });
    }
  }

  // ── Build dashboard items ──
  const dashboard = buildDashboard(candidates, fields);

  // ── Build triage dimensions (all classified fields, capped at 8 for layout) ──
  const triageDimensions: TriageDimension[] = [];
  for (const [, design] of Object.entries(categoryDesign)) {
    if (triageDimensions.length >= 8) break;
    triageDimensions.push({
      key: design.fieldKey,
      label: design.label,
      categories: design.categories,
    });
  }

  // Add experience as a triage dimension if it exists and isn't already classified
  const expField = fields
    .map((f) => f.key)
    .find(
      (k) => k.toLowerCase().includes("experience") || k.toLowerCase().includes("nivel")
    );
  if (expField && !triageDimensions.some((d) => d.key === expField)) {
    const expData = countBy(candidates, expField);
    triageDimensions.push({
      key: expField,
      label: "Experience",
      categories: expData.map((d) => d.name),
    });
  }

  // ── Detect event name from data ──
  // Try to extract from the first registration date range
  const dates = candidates
    .map((c) => new Date(c.createdAt))
    .filter((d) => !isNaN(d.getTime()));
  const eventDate = dates.length > 0
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
        .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";

  // ── Score factors description ──
  const scoreFactors = scoreConfig.factors.map(
    (f) => `${f.name}: up to ${f.maxPoints} pts — ${f.description}`
  );

  return {
    meta: {
      eventName: "Event", // Ambassador can update this in processed.json
      eventDate,
      processedAt: new Date().toISOString(),
      candidateCount: candidates.length,
      lumaColumns: parsed.lumaColumns,
      customColumns: parsed.customColumns,
    },
    schema: {
      dashboard,
      triageDimensions,
      fields,
      scoreFactors,
    },
    candidates,
  };
}
