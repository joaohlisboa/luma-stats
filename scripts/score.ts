/**
 * Step 4: Deterministic scoring.
 * No LLM — pure formula based on classified data + LLM-designed score tiers.
 */

import type { Candidate } from "../lib/types";
import type { CategoryDesign } from "./classify";

export interface ScoreConfig {
  factors: { name: string; maxPoints: number; description: string }[];
}

/**
 * Compute relevance score (0-100) based on available candidate data.
 * Uses scoreTiers from category design (set by the LLM in step 2) so scoring
 * is decoupled from specific category names.
 */
export function computeScores(
  candidates: Candidate[],
  fieldKeys: string[],
  categoryDesign: CategoryDesign
): { candidates: Candidate[]; config: ScoreConfig } {
  const factors: ScoreConfig["factors"] = [];

  // Detect what data is available to score on
  const classifiedFields = fieldKeys.filter((k) =>
    Object.values(categoryDesign).some((d) => d.fieldKey === k)
  );
  const hasResponseQuality = candidates.some((c) => typeof c.responseQuality === "number");
  const hasLinkedin = candidates.some((c) => c.linkedinUrl);

  // Build category distribution: fieldKey → category → count
  const distributions: Record<string, Record<string, number>> = {};
  for (const fieldKey of classifiedFields) {
    const counts: Record<string, number> = {};
    for (const c of candidates) {
      const cat = String(c[fieldKey] || "Other");
      counts[cat] = (counts[cat] || 0) + 1;
    }
    distributions[fieldKey] = counts;
  }

  // Build scoring formula based on available data
  let totalMax = 0;

  // Factor: Diversity — underrepresented categories score higher
  const diversityMaxPts = 20;
  if (classifiedFields.length > 0) {
    for (const fieldKey of classifiedFields) {
      const design = Object.values(categoryDesign).find((d) => d.fieldKey === fieldKey);
      factors.push({
        name: design?.label || fieldKey,
        maxPoints: diversityMaxPts,
        description: `Diversity boost: rarer categories score higher`,
      });
      totalMax += diversityMaxPts;
    }
  }

  // Factor: Response quality (LLM-evaluated) — max 20 pts
  if (hasResponseQuality) {
    factors.push({
      name: "Response quality",
      maxPoints: 40,
      description: "LLM-evaluated quality: specificity, genuine interest, and thoughtfulness of responses",
    });
    totalMax += 40;
  }

  // Factor: LinkedIn presence — max 10 pts
  if (hasLinkedin) {
    factors.push({
      name: "LinkedIn profile",
      maxPoints: 10,
      description: "Having a LinkedIn URL adds points",
    });
    totalMax += 10;
  }

  // Factor: Registration timing — max 20 pts
  factors.push({
    name: "Registration timing",
    maxPoints: 20,
    description: "Earlier registrations score higher",
  });
  totalMax += 20;

  // Normalize to 100
  const scale = totalMax > 0 ? 100 / totalMax : 1;

  // Compute dates for timing score
  const dates = candidates
    .map((c) => new Date(c.createdAt).getTime())
    .filter((d) => !isNaN(d));
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const dateRange = maxDate - minDate || 1;

  // Score each candidate
  const scored = candidates.map((c) => {
    let raw = 0;

    // Diversity: candidates in rarer categories get more points
    for (const fieldKey of classifiedFields) {
      const category = String(c[fieldKey] || "Other");
      const counts = distributions[fieldKey];
      const categoryCount = counts[category] || 1;
      const share = categoryCount / candidates.length;
      // Inverse share: 1% of candidates → ~20 pts, 50% → ~10 pts, 100% → 0 pts
      raw += Math.round((1 - share) * diversityMaxPts);
    }

    // Response quality (LLM-evaluated, 1-5 → 0-40 pts)
    if (hasResponseQuality && typeof c.responseQuality === "number") {
      raw += Math.round(((c.responseQuality - 1) / 4) * 40);
    }

    // LinkedIn
    if (hasLinkedin && c.linkedinUrl) raw += 10;

    // Registration timing (earlier = higher)
    const ts = new Date(c.createdAt).getTime();
    if (!isNaN(ts)) {
      const position = 1 - (ts - minDate) / dateRange;
      raw += Math.round(position * 20);
    }

    return {
      ...c,
      relevanceScore: Math.min(100, Math.round(raw * scale)),
    };
  });

  return { candidates: scored, config: { factors } };
}
