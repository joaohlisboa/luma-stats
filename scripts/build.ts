/**
 * Step 5: Build processed.json — deterministic aggregation and config.
 * No LLM — pure computation from classified + scored data.
 */

import type {
  ProcessedData,
  DashboardItem,
  ChartConfig,
  StatCardConfig,
  TriageDimension,
  FieldSchema,
  Candidate,
} from "../lib/types";
import type { CategoryDesign } from "./classify";
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

function buildTimeline(candidates: Candidate[]): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  for (const c of candidates) {
    if (!c.createdAt) continue;
    const d = new Date(c.createdAt);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getDate()}/${d.getMonth() + 1}`;
    counts[key] = (counts[key] || 0) + 1;
  }

  // Sort chronologically
  return Object.entries(counts)
    .map(([name, value]) => {
      const [day, month] = name.split("/").map(Number);
      return { name, value, sortKey: month * 100 + day };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ name, value }) => ({ name, value }));
}

export function buildProcessedData(input: BuildInput): ProcessedData {
  const { parsed, candidates, categoryDesign, scoreConfig } = input;

  // ── Build field schemas ──
  const fields: FieldSchema[] = [];
  const classifiedFieldKeys: string[] = [];

  // Standard Luma fields
  fields.push({ key: "name", label: "Name", source: "luma", render: "hidden" });
  fields.push({ key: "email", label: "Email", source: "luma", render: "hidden" });
  fields.push({ key: "approvalStatus", label: "Status", source: "luma", render: "hidden" });

  // Classified fields from category design + their raw counterparts
  for (const [, design] of Object.entries(categoryDesign)) {
    classifiedFieldKeys.push(design.fieldKey);
    // Classified category → filter
    fields.push({
      key: design.fieldKey,
      label: design.label,
      source: "classified",
      render: "filter",
    });
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
  const dashboard: DashboardItem[] = [];
  let chartId = 0;

  // Stat cards
  const statTotal: StatCardConfig = {
    id: `chart-${chartId++}`,
    type: "stat-card",
    title: "Registrations",
    value: String(candidates.length),
  };
  dashboard.push(statTotal);

  // Find experience field for a % stat card (could be classified or fixed-choice)
  const allFieldKeys = [...classifiedFieldKeys, ...fields.map((f) => f.key)];
  const expField = allFieldKeys.find((k) =>
    k.toLowerCase().includes("experience") || k.toLowerCase().includes("nivel")
  );
  if (expField) {
    const expData = countBy(candidates, expField);
    const daily = expData.find((d) =>
      d.name.toLowerCase().includes("daily") || d.name.toLowerCase().includes("diári")
    );
    if (daily) {
      const pct = Math.round((daily.value / candidates.length) * 100);
      dashboard.push({
        id: `chart-${chartId++}`,
        type: "stat-card",
        title: "Daily users",
        value: `${pct}%`,
        subtitle: `${daily.value} candidates`,
      } as StatCardConfig);
    }
  }

  // Find a boolean "wants to present" type field
  for (const f of fields) {
    if (f.render === "filter" && f.source === "custom") {
      const vals = countBy(candidates, f.key);
      const yesVal = vals.find((v) =>
        v.name.toLowerCase() === "yes" || v.name.toLowerCase() === "sim"
      );
      if (yesVal && vals.length <= 3) {
        // Shorten label for stat card
        let label = f.label;
        if (label.length > 30) {
          if (label.toLowerCase().includes("present")) label = "Want to present";
          else label = label.slice(0, 27) + "...";
        }
        dashboard.push({
          id: `chart-${chartId++}`,
          type: "stat-card",
          title: label,
          value: String(yesVal.value),
          subtitle: `said yes`,
        } as StatCardConfig);
        break;
      }
    }
  }

  // Timeline chart
  const timeline = buildTimeline(candidates);
  if (timeline.length > 1) {
    dashboard.push({
      id: `chart-${chartId++}`,
      type: "area-timeline",
      title: "Registrations over time",
      data: timeline,
    } as ChartConfig);
  }

  // Charts for classified fields
  for (const [, design] of Object.entries(categoryDesign)) {
    const data = countBy(candidates, design.fieldKey);
    const chartType = data.length <= 6 ? "donut" : "horizontal-bar";

    dashboard.push({
      id: `chart-${chartId++}`,
      type: chartType,
      title: design.label,
      data,
    } as ChartConfig);
  }

  // Charts for non-classified filter fields with reasonable cardinality
  for (const f of fields) {
    if (f.source === "custom" && f.render === "filter") {
      // Check it's not already a classified field
      if (classifiedFieldKeys.includes(f.key)) continue;

      const data = countBy(candidates, f.key);
      if (data.length >= 2 && data.length <= 15) {
        const chartType = data.length <= 6 ? "donut" : "horizontal-bar";
        dashboard.push({
          id: `chart-${chartId++}`,
          type: chartType,
          title: f.label,
          data,
        } as ChartConfig);
      }
    }
  }

  // ── Build triage dimensions (top 3-4 classified fields) ──
  const triageDimensions: TriageDimension[] = [];
  for (const [, design] of Object.entries(categoryDesign)) {
    if (triageDimensions.length >= 4) break;
    triageDimensions.push({
      key: design.fieldKey,
      label: design.label,
      categories: design.categories,
    });
  }

  // Add experience as a triage dimension if it exists and isn't already classified
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
