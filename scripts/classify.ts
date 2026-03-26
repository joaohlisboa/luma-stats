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
  batchSize: number = 50
): Promise<ClassifiedCandidate[]> {
  if (qualitativeColumns.length === 0) return [];

  const batches: Record<string, string>[][] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    batches.push(rows.slice(i, i + batchSize));
  }

  const fieldKeys = qualitativeColumns
    .map((q) => categoryDesign[q.column]?.fieldKey)
    .filter(Boolean) as string[];

  const categoryRef = qualitativeColumns
    .map((q) => {
      const design = categoryDesign[q.column];
      if (!design) return null;
      return `${design.fieldKey}: ${design.categories.join(" | ")}`;
    })
    .filter(Boolean)
    .join("\n");

  const CONCURRENCY = 10;
  console.log(`  Classifying ${rows.length} candidates in ${batches.length} batch(es), ${CONCURRENCY} parallel...`);

  // Build all prompts
  const batchPrompts = batches.map((batch, i) => {
    const header = `id | ${qualitativeColumns.map((q) => categoryDesign[q.column]?.fieldKey || q.column).join(" | ")}`;
    const candidateLines = batch.map((row) => {
      const id = row["api_id"] || "";
      const fields = qualitativeColumns
        .map((q) => (row[q.column] || "—").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 200))
        .join(" | ");
      return `${id} | ${fields}`;
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
