// ── Chart vocabulary ──

export type ChartType =
  | "stat-card"
  | "horizontal-bar"
  | "donut"
  | "area-timeline";

export interface ChartConfig {
  id: string;
  type: Exclude<ChartType, "stat-card">;
  title: string;
  data: { name: string; value: number }[];
  color?: string;
}

export interface StatCardConfig {
  id: string;
  type: "stat-card";
  title: string;
  value: string;
  subtitle?: string;
}

export type DashboardItem = ChartConfig | StatCardConfig;

// ── Schema: how each field should render ──

export interface FieldSchema {
  key: string;
  label: string;
  source: "luma" | "custom" | "classified";
  render: "filter" | "chart" | "detail" | "hidden";
}

// ── Candidate ──

export interface Candidate {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  approvalStatus: string;
  linkedinUrl?: string;
  relevanceScore: number;
  [key: string]: unknown;
}

// ── Triage dimension for balance tracking ──

export interface TriageDimension {
  key: string;
  label: string;
  categories: string[];
}

// ── Root processed.json shape ──

export interface ProcessedData {
  meta: {
    eventName: string;
    eventDate: string;
    eventLocation?: string;
    processedAt: string;
    candidateCount: number;
    lumaColumns: string[];
    customColumns: string[];
  };
  schema: {
    dashboard: DashboardItem[];
    triageDimensions: TriageDimension[];
    fields: FieldSchema[];
    scoreFactors: string[];
  };
  candidates: Candidate[];
}
