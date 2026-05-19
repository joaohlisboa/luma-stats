/**
 * Steps 2 & 3: LLM classification.
 *
 * Step 2: One small call — analyze unique values, design categories per field.
 * Step 3: Parallel batched calls — classify each candidate into those categories.
 */

import { execSync, exec } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";
import type { ParsedCSV } from "./parse";

export interface CategoryDesign {
  [columnName: string]: {
    categories: string[];
    /** @deprecated — no longer used for scoring. Kept for cache compatibility. */
    scoreTiers?: Record<string, number>;
    fieldKey: string;
    label: string;
  };
}

export interface ClassifiedCandidate {
  id: string;
  classifications: Record<string, string>;
  /** LLM-evaluated response quality (1-5). */
  responseQuality: number;
}

/**
 * Synthetic fields derived from multiple inputs rather than one CSV column.
 * Keys are sentinel column names (prefixed `__synthetic_`) so they don't collide
 * with real CSV columns; the rest of the pipeline reads them like normal entries
 * in CategoryDesign.
 */
export const SYNTHETIC_FIELDS: CategoryDesign = {
  __synthetic_gender: {
    categories: ["Male", "Female", "Unknown"],
    fieldKey: "gender",
    label: "Gender",
  },
  __synthetic_technicality: {
    categories: ["Technical", "Non-technical", "Mixed / Unclear"],
    fieldKey: "technicality",
    label: "Technical background",
  },
};

/** Returns true if a category-design entry is a synthetic field. */
export function isSyntheticKey(col: string): boolean {
  return col.startsWith("__synthetic_");
}

/**
 * Pick custom columns that hint at someone's technical background — used as
 * extra context for the synthetic `technicality` classification (the existing
 * qualitative columns already cover role/work/interests).
 */
export function pickTechnicalContextColumns(customColumns: string[]): string[] {
  const patterns = [/experience/i, /level/i, /problem/i, /plan/i, /employees/i];
  return customColumns.filter((c) => patterns.some((re) => re.test(c)));
}

// Both design and classification use opus for quality
const DESIGN_MODEL = "opus";
const CLASSIFY_MODEL = "opus";

function callClaude(prompt: string, model: string): string {
  const tmpFile = resolve(tmpdir(), `luma-classify-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(tmpFile, prompt);

  try {
    return execSync(`claude -p --model ${model} < "${tmpFile}"`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
      shell: "/bin/sh",
    });
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

function callClaudeAsync(prompt: string, model: string): Promise<string> {
  return new Promise((resolve_p, reject) => {
    const tmpFile = resolve(tmpdir(), `luma-classify-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    writeFileSync(tmpFile, prompt);

    exec(`claude -p --model ${model} < "${tmpFile}"`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
      shell: "/bin/sh",
    }, (err, stdout, stderr) => {
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
      if (err) {
        const msg = stderr?.slice(0, 200) || err.message?.slice(0, 200) || "unknown error";
        reject(new Error(msg));
      } else {
        resolve_p(stdout);
      }
    });
  });
}

/** Run async tasks with a concurrency limit */
async function parallel<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

function extractJSON(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  return JSON.parse(text);
}

/**
 * Step 2: Ask Claude to design categories for each qualitative column.
 * ONE small synchronous call — just unique values, no candidate data.
 */
export function designCategories(
  qualitativeColumns: { column: string; sampleValues: string[] }[]
): CategoryDesign {
  if (qualitativeColumns.length === 0) return {};

  const columnsDescription = qualitativeColumns
    .map((q) => {
      const samples = q.sampleValues.slice(0, 40).map((v) => `"${v}"`).join(", ");
      return `Column: "${q.column}"\nSample values (${q.sampleValues.length} unique): ${samples}`;
    })
    .join("\n\n");

  const prompt = `You are analyzing registration form data for an event. For each column below, design up to 8 meaningful categories plus an "Other" catch-all (9 total max).

Rules:
- Maximum 8 specific categories + 1 "Other" catch-all as the last one (9 total max)
- Category names MUST be in ENGLISH regardless of the data language
- Categories should be mutually exclusive
- Merge similar/overlapping values into broader categories to stay within the limit
- Also provide a camelCase fieldKey (for use as a JSON key) and a human-readable label in English

${columnsDescription}

Output valid JSON only (no markdown fences, no explanation). Format:
{
  "Column Name Here": {
    "categories": ["Category1", "Category2", "Other"],
    "fieldKey": "camelCaseKey",
    "label": "Human Readable Label"
  }
}`;

  console.log(`  Designing categories (model: ${DESIGN_MODEL})...`);
  const response = callClaude(prompt, DESIGN_MODEL);
  return extractJSON(response) as CategoryDesign;
}

/**
 * Step 3: Classify candidates in PARALLEL batches.
 * Batch size 50, up to 10 concurrent Opus calls.
 */
export async function classifyCandidates(
  rows: Record<string, string>[],
  qualitativeColumns: { column: string; sampleValues: string[] }[],
  categoryDesign: CategoryDesign,
  contextColumns: string[] = [],
  batchSize: number = 50
): Promise<ClassifiedCandidate[]> {
  // Output field set: all entries in categoryDesign (includes synthetic ones).
  const outputEntries = Object.entries(categoryDesign);
  if (outputEntries.length === 0) return [];

  const batches: Record<string, string>[][] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    batches.push(rows.slice(i, i + batchSize));
  }

  const fieldKeys = outputEntries.map(([, d]) => d.fieldKey);

  const categoryRef = outputEntries
    .map(([, design]) => `${design.fieldKey}: ${design.categories.join(" | ")}`)
    .join("\n");

  const CONCURRENCY = 10;
  console.log(`  Classifying ${rows.length} candidates in ${batches.length} batch(es), ${CONCURRENCY} parallel...`);

  const cleanCell = (v: string) =>
    (v || "—").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 200);

  // Build all prompts
  const batchPrompts = batches.map((batch, i) => {
    const inputHeaders = [
      "firstName",
      ...qualitativeColumns.map((q) => categoryDesign[q.column]?.fieldKey || q.column),
      ...contextColumns,
    ];
    const header = `id | ${inputHeaders.join(" | ")}`;

    const candidateLines = batch.map((row) => {
      const id = row["guest_id"] || row["api_id"] || "";
      const cells: string[] = [
        cleanCell(row["first_name"] || row["name"] || ""),
        ...qualitativeColumns.map((q) => cleanCell(row[q.column] || "")),
        ...contextColumns.map((c) => cleanCell(row[c] || "")),
      ];
      return `${id} | ${cells.join(" | ")}`;
    });

    return {
      index: i,
      size: batch.length,
      prompt: `Classify each row into exactly one category per field. Also evaluate the overall quality of each candidate's responses.

For responseQuality (1-5), evaluate:
- 5: Specific, thoughtful, shows genuine curiosity or clear intent to learn/contribute
- 4: Good detail, relevant interest, clear motivation
- 3: Adequate response, somewhat generic but shows basic interest
- 2: Vague, low-effort, or mostly self-promotional
- 1: Empty, irrelevant, spam, or purely selfish motivation (e.g., only wants to sell/recruit)

Judge the QUALITY of what they wrote, not the length. A short but specific answer ("I want to learn how to use Claude for code review in my team") scores higher than a long generic one.

For "gender": infer from firstName using common naming conventions across cultures (most cultures have strong gender associations for common first names — apply whichever convention fits the name, e.g. Portuguese -a/-o endings, Slavic -ova suffixes, etc.). Use "Unknown" for genuinely unisex names, initials, or empty values. When uncertain, prefer "Unknown" over guessing.

For "technicality": consider ALL inputs together — role, work/study context, experience level, interests, problem they care about, etc.
- "Technical": software engineers, data/AI specialists, students of CS/engineering/exact-sciences, researchers in technical fields, anyone who codes regularly.
- "Non-technical": pure business/finance/legal/marketing/design roles with no coding signal, students of humanities/social sciences, executives whose listed interests are strategy/management without dev tooling.
- "Mixed / Unclear": product managers, consultants, founders who clearly mix tech with business, or cases where signals genuinely conflict.
Weigh role + interests heavily; do NOT decide based on Claude experience level alone (a non-technical exec can be a daily user).

Categories:
${categoryRef}

Data (${header}):
${candidateLines.join("\n")}

Output JSON only: {"r":[{"i":"id","c":{"${fieldKeys.join('":"cat","')}":"cat"},"q":3},...]}
Use "r" for results, "i" for id, "c" for classifications, "q" for responseQuality (1-5 integer). Use exact category names from above.`,
    };
  });

  // Launch batches with controlled concurrency
  const startTime = Date.now();
  const tasks = batchPrompts.map(({ index, size, prompt }) => {
    return async (): Promise<ClassifiedCandidate[]> => {
      const t0 = Date.now();
      try {
        const response = await callClaudeAsync(prompt, CLASSIFY_MODEL);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`  Batch ${index + 1}/${batches.length} done (${size} candidates, ${elapsed}s)`);

        const parsed = extractJSON(response) as {
          r?: { i: string; c: Record<string, string>; q?: number }[];
          results?: ClassifiedCandidate[];
        };

        const results: ClassifiedCandidate[] = [];
        if (parsed.r && Array.isArray(parsed.r)) {
          for (const item of parsed.r) {
            const q = typeof item.q === "number" ? Math.max(1, Math.min(5, item.q)) : 3;
            results.push({ id: item.i, classifications: item.c, responseQuality: q });
          }
        } else if (parsed.results && Array.isArray(parsed.results)) {
          results.push(...parsed.results);
        }
        return results;
      } catch (firstErr) {
        const msg1 = firstErr instanceof Error ? firstErr.message.slice(0, 100) : "unknown";
        console.error(`  Warning: Batch ${index + 1} failed (${msg1}), retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const response = await callClaudeAsync(prompt, CLASSIFY_MODEL);
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          console.log(`  Batch ${index + 1}/${batches.length} done on retry (${size} candidates, ${elapsed}s)`);

          const parsed = extractJSON(response) as {
            r?: { i: string; c: Record<string, string>; q?: number }[];
            results?: ClassifiedCandidate[];
          };

          const results: ClassifiedCandidate[] = [];
          if (parsed.r && Array.isArray(parsed.r)) {
            for (const item of parsed.r) {
              const q = typeof item.q === "number" ? Math.max(1, Math.min(5, item.q)) : 3;
              results.push({ id: item.i, classifications: item.c, responseQuality: q });
            }
          } else if (parsed.results && Array.isArray(parsed.results)) {
            results.push(...parsed.results);
          }
          return results;
        } catch (retryErr) {
          const msg2 = retryErr instanceof Error ? retryErr.message.slice(0, 100) : "unknown";
          console.error(`  Error: Batch ${index + 1} failed on retry (${msg2}), skipping ${size} candidates`);
          return [];
        }
      }
    };
  });

  const batchResults = await parallel(tasks, CONCURRENCY);
  const allResults = batchResults.flat();

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  All batches complete in ${totalElapsed}s total`);

  return allResults;
}
