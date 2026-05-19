/**
 * Main orchestrator: parse → classify (LLM) → score → build → validate → write.
 *
 * LLM is only used for subjective classification (Steps 2-3).
 * Everything else is deterministic scripts.
 */

import { existsSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import { parseCSV, detectQualitativeColumns } from "./parse";
import {
  designCategories,
  classifyCandidates,
  pickTechnicalContextColumns,
  SYNTHETIC_FIELDS,
  type CategoryDesign,
} from "./classify";
import { computeScores } from "./score";
import { buildProcessedData } from "./build";
import { processedDataSchema } from "../lib/schema";
import type { Candidate } from "../lib/types";

const DATA_DIR = resolve(__dirname, "../data");
const CSV_PATH = resolve(DATA_DIR, "list.csv");
const OUTPUT_PATH = resolve(DATA_DIR, "processed.json");
const CACHE_PATH = resolve(DATA_DIR, "llm-cache.json");
const TRIAGE_PATH = resolve(DATA_DIR, "triage.json");

const isRebuild = process.argv.includes("--rebuild");
const isUpdate = process.argv.includes("--update");

interface LLMCache {
  categoryDesign: CategoryDesign;
  classifications: Record<string, Record<string, string>>;
  responseQualities?: Record<string, number>;
}

/**
 * Remap any classification that's missing or not in the designed category set
 * to the field's catch-all (last category by convention: "Other"/"Unknown"/"Mixed").
 */
function remapInvalidClassifications(
  classifications: Map<string, Record<string, string>>,
  categoryDesign: CategoryDesign,
): void {
  let remapped = 0;
  for (const [, cls] of classifications) {
    for (const [, design] of Object.entries(categoryDesign)) {
      const fieldKey = design.fieldKey;
      const value = cls[fieldKey];
      const fallback = design.categories[design.categories.length - 1] || "Other";
      if (value && !design.categories.includes(value)) {
        cls[fieldKey] = fallback;
        remapped++;
      } else if (!value) {
        cls[fieldKey] = fallback;
        remapped++;
      }
    }
  }
  if (remapped > 0) {
    console.log(`  Validation: remapped ${remapped} invalid classification(s) to catch-all`);
  }
}

async function main() {
  // ── Check CSV exists ──
  if (!existsSync(CSV_PATH)) {
    console.error("\n  Error: data/list.csv not found.\n");
    console.error("  Steps:");
    console.error("  1. Export your guest list CSV from Luma");
    console.error("  2. Place it at data/list.csv");
    console.error("  3. Run this command again: pnpm process\n");
    process.exit(1);
  }

  // ── Step 1: Parse CSV (instant) ──
  console.log("Step 1: Parsing CSV...");
  const parsed = parseCSV(CSV_PATH);
  console.log(`  ${parsed.rows.length} candidates, ${parsed.headers.length} columns`);
  console.log(`  Luma columns: ${parsed.lumaColumns.length}`);
  console.log(`  Custom columns: ${parsed.customColumns.length}`);

  const qualitative = detectQualitativeColumns(parsed);
  console.log(`  Qualitative fields needing classification: ${qualitative.length}`);
  for (const q of qualitative) {
    console.log(`    - "${q.column}" (${q.sampleValues.length} unique values)`);
  }

  // ── Steps 2 & 3: LLM classification (cached) ──
  let categoryDesign: CategoryDesign = {};
  const classifications: Map<string, Record<string, string>> = new Map();
  const responseQualities: Map<string, number> = new Map();

  if (isRebuild && existsSync(CACHE_PATH)) {
    // --rebuild mode: reuse cached LLM results
    console.log("\nSteps 2-3: Using cached LLM results (--rebuild mode)...");
    const cache: LLMCache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    categoryDesign = cache.categoryDesign;
    for (const [id, cls] of Object.entries(cache.classifications)) {
      classifications.set(id, cls);
    }
    if (cache.responseQualities) {
      for (const [id, q] of Object.entries(cache.responseQualities)) {
        responseQualities.set(id, q);
      }
    }
    console.log(`  ${Object.keys(categoryDesign).length} fields, ${classifications.size} cached classifications`);
  } else if (isUpdate && existsSync(CACHE_PATH)) {
    // --update mode: reuse cached categoryDesign + classifications,
    // classify only ids that aren't in the cache yet.
    console.log("\nSteps 2-3: --update mode — loading cache, classifying new candidates only...");
    const cache: LLMCache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
    categoryDesign = cache.categoryDesign;
    for (const [id, cls] of Object.entries(cache.classifications)) {
      classifications.set(id, cls);
    }
    if (cache.responseQualities) {
      for (const [id, q] of Object.entries(cache.responseQualities)) {
        responseQualities.set(id, q);
      }
    }

    const newRows = parsed.rows.filter((row) => {
      const id = row["guest_id"] || row["api_id"] || "";
      return id && !classifications.has(id);
    });
    console.log(`  Cache: ${classifications.size} existing · CSV: ${parsed.rows.length} rows · new: ${newRows.length}`);

    if (newRows.length > 0 && qualitative.length > 0) {
      const contextColumns = pickTechnicalContextColumns(parsed.customColumns);
      if (contextColumns.length > 0) {
        console.log(`  Extra context for technicality: ${contextColumns.join(", ")}`);
      }
      const results = await classifyCandidates(newRows, qualitative, categoryDesign, contextColumns);
      for (const r of results) {
        classifications.set(r.id, r.classifications);
        responseQualities.set(r.id, r.responseQuality);
      }
      console.log(`  Classified ${results.length} new candidate(s)`);
      remapInvalidClassifications(classifications, categoryDesign);

      // Persist updated cache
      const updatedCache: LLMCache = {
        categoryDesign,
        classifications: Object.fromEntries(classifications),
        responseQualities: Object.fromEntries(responseQualities),
      };
      writeFileSync(CACHE_PATH, JSON.stringify(updatedCache, null, 2));
      console.log("  Cache updated.");
    } else if (newRows.length === 0) {
      console.log("  No new candidates — refreshing Luma fields (approval_status, check-ins) from CSV.");
    }
  } else if (qualitative.length > 0) {
    if (isUpdate) {
      console.warn("  --update requested but no cache found at data/llm-cache.json — running full process.");
    }
    // Step 2: Design categories (1 small LLM call)
    console.log("\nStep 2: Designing categories (LLM)...");
    categoryDesign = designCategories(qualitative);
    // Prepend synthetic fields (gender, technicality) so they appear first
    // as triage dimensions. Categories are hardcoded, not LLM-designed.
    categoryDesign = { ...SYNTHETIC_FIELDS, ...categoryDesign };
    for (const [col, design] of Object.entries(categoryDesign)) {
      console.log(`  ${col} → ${design.fieldKey}: ${design.categories.length} categories`);
    }

    // Step 3: Classify candidates (batched LLM calls)
    console.log("\nStep 3: Classifying candidates (LLM)...");
    const contextColumns = pickTechnicalContextColumns(parsed.customColumns);
    if (contextColumns.length > 0) {
      console.log(`  Extra context for technicality: ${contextColumns.join(", ")}`);
    }
    const results = await classifyCandidates(
      parsed.rows,
      qualitative,
      categoryDesign,
      contextColumns,
    );
    for (const r of results) {
      classifications.set(r.id, r.classifications);
      responseQualities.set(r.id, r.responseQuality);
    }
    console.log(`  Classified ${classifications.size}/${parsed.rows.length} candidates`);

    remapInvalidClassifications(classifications, categoryDesign);

    // Cache LLM results for --rebuild / --update
    const cache: LLMCache = {
      categoryDesign,
      classifications: Object.fromEntries(classifications),
      responseQualities: Object.fromEntries(responseQualities),
    };
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    console.log("  Cached LLM results to data/llm-cache.json");
  } else {
    console.log("\nSteps 2-3: No qualitative fields — skipping.");
  }

  // ── Build candidate objects ──
  console.log("\nStep 4: Building candidate objects...");
  const candidates: Candidate[] = parsed.rows.map((row) => {
    const id = row["guest_id"] || row["api_id"] || "";
    const c: Candidate = {
      id,
      name: row["name"] || "",
      firstName: row["first_name"] || "",
      lastName: row["last_name"] || "",
      email: row["email"] || "",
      createdAt: row["created_at"] || "",
      approvalStatus: row["approval_status"] || "pending_approval",
      relevanceScore: 0, // will be computed in scoring step
    };

    // Add LinkedIn if present
    for (const col of parsed.customColumns) {
      const val = row[col] || "";
      if (val.includes("linkedin.com")) {
        c.linkedinUrl = val;
        break;
      }
    }

    // Add response quality from LLM evaluation
    const rq = responseQualities.get(id);
    if (rq !== undefined) {
      c.responseQuality = rq;
    }

    // Add classifications AND raw values for classified fields
    const cls = classifications.get(id);
    if (cls) {
      for (const [key, value] of Object.entries(cls)) {
        c[key] = value;
      }
    }
    // Add raw values for classified columns (e.g., roleRaw, workplaceRaw)
    for (const [col, design] of Object.entries(categoryDesign)) {
      const rawVal = row[col]?.trim() || "";
      if (rawVal) {
        c[`${design.fieldKey}Raw`] = rawVal;
      }
    }

    // Add fixed-choice custom fields (experience level, company size, etc.)
    for (const col of parsed.customColumns) {
      const design = categoryDesign[col];
      if (design) continue; // raw already added above

      const val = row[col]?.trim() || "";
      if (!val) continue;

      // Generate camelCase key
      const key = col
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .trim()
        .split(/\s+/)
        .map((w, i) =>
          i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        )
        .join("");

      if (key && !c[key]) {
        c[key] = val;
      }
    }

    return c;
  });

  // ── Step 4: Score candidates (deterministic) ──
  console.log("  Scoring candidates...");
  const classifiedFieldKeys = Object.values(categoryDesign).map((d) => d.fieldKey);
  const { candidates: scored, config: scoreConfig } = computeScores(candidates, classifiedFieldKeys, categoryDesign);
  console.log(`  Scored ${scored.length} candidates`);
  console.log(`  Factors: ${scoreConfig.factors.map((f) => f.name).join(", ")}`);

  // ── Step 5: Build processed.json (deterministic) ──
  console.log("\nStep 5: Building dashboard configuration...");
  const processed = buildProcessedData({
    parsed,
    candidates: scored,
    categoryDesign,
    scoreConfig,
  });
  console.log(`  Dashboard: ${processed.schema.dashboard.length} items`);
  console.log(`  Triage dimensions: ${processed.schema.triageDimensions.length}`);
  console.log(`  Fields: ${processed.schema.fields.length}`);

  // ── Validate ──
  console.log("\nValidating output...");
  const result = processedDataSchema.safeParse(processed);

  if (!result.success) {
    console.error("\n  Error: Output did not match expected schema.\n");
    console.error("  Validation errors:");
    for (const issue of result.error.issues.slice(0, 10)) {
      console.error(`    - ${issue.path.join(".")}: ${issue.message}`);
    }

    const debugPath = resolve(DATA_DIR, "processed-debug.json");
    writeFileSync(debugPath, JSON.stringify(processed, null, 2));
    console.error(`\n  Debug output saved to data/processed-debug.json\n`);
    process.exit(1);
  }

  // ── Write output ──
  writeFileSync(OUTPUT_PATH, JSON.stringify(result.data, null, 2));

  // ── Reset triage decisions ──
  // A fresh CSV import means Luma's approval_status is the new source of
  // truth. The user's local approve/decline decisions from before this
  // import are stale — wipe them. Category overrides (data/overrides.json)
  // are preserved because LLM classifications didn't change for cached ids.
  // Skip in --rebuild mode (that path is for regenerating outputs from cache,
  // not for ingesting a fresh export).
  if (!isRebuild && existsSync(TRIAGE_PATH)) {
    unlinkSync(TRIAGE_PATH);
    console.log(`\n  Reset data/triage.json — Luma's approval_status is now the source of truth.`);
    console.log(`  If the dev server is open, reload the tab so it picks up the reset.`);
  }

  console.log(`\n  Done! Processed ${result.data.meta.candidateCount} candidates.`);
  console.log(`  Dashboard: ${result.data.schema.dashboard.length} charts`);
  console.log(`  Triage: ${result.data.schema.triageDimensions.length} dimensions`);
  console.log(`\n  Output: data/processed.json`);
  console.log(`  Run: pnpm dev\n`);
}

main();
