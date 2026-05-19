import type {
  Candidate,
  DashboardItem,
  ChartConfig,
  StatCardConfig,
  FieldSchema,
} from "./types";

function countBy(
  candidates: Candidate[],
  key: string
): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  for (const c of candidates) {
    const val = String(c[key] || "Other");
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}

function buildTimeline(
  candidates: Candidate[]
): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  for (const c of candidates) {
    if (!c.createdAt) continue;
    const d = new Date(c.createdAt);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getDate()}/${d.getMonth() + 1}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, value]) => {
      const [day, month] = name.split("/").map(Number);
      return { name, value, sortKey: month * 100 + day };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ name, value }) => ({ name, value }));
}

export function buildDashboard(
  candidates: Candidate[],
  fields: FieldSchema[]
): DashboardItem[] {
  const classifiedFieldKeys = fields
    .filter((f) => f.source === "classified")
    .map((f) => f.key);
  const classifiedFields = fields.filter((f) => f.source === "classified");

  const dashboard: DashboardItem[] = [];
  let chartId = 0;

  // Total registrations
  dashboard.push({
    id: `chart-${chartId++}`,
    type: "stat-card",
    title: "Registrations",
    value: String(candidates.length),
  } as StatCardConfig);

  // Daily users %, if an "experience"/"nivel" field exists
  const allFieldKeys = fields.map((f) => f.key);
  const expField = allFieldKeys.find(
    (k) => k.toLowerCase().includes("experience") || k.toLowerCase().includes("nivel")
  );
  if (expField && candidates.length > 0) {
    const expData = countBy(candidates, expField);
    const daily = expData.find(
      (d) =>
        d.name.toLowerCase().includes("daily") ||
        d.name.toLowerCase().includes("diári")
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

  // Boolean "wants to present"-style stat card
  for (const f of fields) {
    if (f.render === "filter" && f.source === "custom") {
      const vals = countBy(candidates, f.key);
      const yesVal = vals.find(
        (v) => v.name.toLowerCase() === "yes" || v.name.toLowerCase() === "sim"
      );
      if (yesVal && vals.length <= 3) {
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

  // Timeline
  const timeline = buildTimeline(candidates);
  if (timeline.length > 1) {
    dashboard.push({
      id: `chart-${chartId++}`,
      type: "area-timeline",
      title: "Registrations over time",
      data: timeline,
    } as ChartConfig);
  }

  // Classified fields → charts
  for (const f of classifiedFields) {
    const data = countBy(candidates, f.key);
    const chartType = data.length <= 6 ? "donut" : "horizontal-bar";
    dashboard.push({
      id: `chart-${chartId++}`,
      type: chartType,
      title: f.label,
      data,
    } as ChartConfig);
  }

  // Non-classified filter fields → charts
  for (const f of fields) {
    if (f.source === "custom" && f.render === "filter") {
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

  return dashboard;
}
