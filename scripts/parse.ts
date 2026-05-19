/**
 * Step 1: Parse CSV — identify columns, extract rows, detect custom fields.
 * Pure deterministic script, no LLM.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const STANDARD_LUMA_COLUMNS = new Set([
  // Luma renamed api_id → guest_id; keep both for backward compatibility
  "api_id", "guest_id",
  "name", "first_name", "last_name", "email", "phone_number",
  "created_at", "approval_status", "checked_in_at", "custom_source", "utm_source",
  "qr_code_url", "amount", "amount_tax", "amount_discount", "currency",
  "coupon_code", "eth_address", "solana_address", "survey_response_rating",
  "survey_response_feedback", "ticket_type_id", "ticket_name",
]);

// Columns that are always empty/irrelevant for most events
const SKIP_COLUMNS = new Set([
  "qr_code_url", "amount", "amount_tax", "amount_discount", "currency",
  "coupon_code", "eth_address", "solana_address", "survey_response_rating",
  "survey_response_feedback", "ticket_type_id", "ticket_name",
  "custom_source", "utm_source", "phone_number", "checked_in_at",
]);

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  lumaColumns: string[];
  customColumns: string[];
  /** For each custom column: unique non-empty values */
  uniqueValues: Record<string, string[]>;
}

/** Simple CSV parser that handles quoted fields with commas and newlines */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Split CSV text into logical lines (handling quoted newlines) */
function splitCSVLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "\n" && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

export function parseCSV(csvPath?: string): ParsedCSV {
  const path = csvPath || resolve(__dirname, "../data/list.csv");
  let content = readFileSync(path, "utf-8");

  // Strip BOM
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const lines = splitCSVLines(content);
  if (lines.length < 2) throw new Error("CSV has no data rows");

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }
    rows.push(row);
  }

  const lumaColumns = headers.filter((h) => STANDARD_LUMA_COLUMNS.has(h));
  const customColumns = headers.filter((h) => !STANDARD_LUMA_COLUMNS.has(h));

  // Collect unique values for custom columns (for LLM category design)
  const uniqueValues: Record<string, string[]> = {};
  for (const col of customColumns) {
    const vals = new Set<string>();
    for (const row of rows) {
      const v = row[col]?.trim();
      if (v && v !== "-" && v !== "n/a" && v !== "N/A") vals.add(v);
    }
    uniqueValues[col] = [...vals];
  }

  return { headers, rows, lumaColumns, customColumns, uniqueValues };
}

/** Detect which custom columns have qualitative free-text that needs LLM classification */
export function detectQualitativeColumns(
  parsed: ParsedCSV
): { column: string; sampleValues: string[] }[] {
  const qualitative: { column: string; sampleValues: string[] }[] = [];

  for (const col of parsed.customColumns) {
    if (SKIP_COLUMNS.has(col)) continue;

    const values = parsed.uniqueValues[col] || [];
    if (values.length === 0) continue;

    // Heuristic: if there are many unique values relative to total rows,
    // it's likely free-text that needs classification
    const uniqueRatio = values.length / parsed.rows.length;

    // Skip columns that are: boolean (Yes/No), very low cardinality (<5 unique),
    // or URL-like (linkedin)
    const isBoolean = values.every((v) =>
      ["yes", "no", "true", "false", "sim", "não"].includes(v.toLowerCase())
    );
    const isUrl = values.some((v) => v.startsWith("http"));
    const isFixedChoice = values.length <= 6 && uniqueRatio < 0.02;
    const isLegal = col.toLowerCase().includes("terms") || col.toLowerCase().includes("newsletter");

    if (isBoolean || isUrl || isLegal) continue;

    if (isFixedChoice) {
      // Low cardinality — keep as-is, no LLM needed
      continue;
    }

    // This column needs LLM classification
    // Send a sample of values (up to 50 unique) to keep prompt small
    const sample = values.slice(0, 50);
    qualitative.push({ column: col, sampleValues: sample });
  }

  return qualitative;
}

// Run standalone for testing
if (require.main === module) {
  const parsed = parseCSV();
  console.log(`Parsed ${parsed.rows.length} rows, ${parsed.headers.length} columns`);
  console.log(`Luma columns: ${parsed.lumaColumns.length}`);
  console.log(`Custom columns: ${parsed.customColumns.length}`);
  console.log(`Custom columns: ${parsed.customColumns.join(", ")}`);

  const qual = detectQualitativeColumns(parsed);
  console.log(`\nQualitative columns needing LLM classification: ${qual.length}`);
  for (const q of qual) {
    console.log(`  - "${q.column}" (${q.sampleValues.length} unique values)`);
  }
}
