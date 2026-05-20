// Fuzzy team resolution for /groups-setup. Reads processed.json + groups-config.json,
// produces a draft team-seeds.json. Approved candidates only.
//
// Output also includes a `_review` block (medium-confidence matches and unresolved
// mentions) that the slash command surfaces to the user before finalizing.

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type {
  GroupsConfig,
  SeedCluster,
  TeamSeeds,
  UnresolvedMention,
} from "../lib/groups-types";
import type { Candidate, ProcessedData } from "../lib/types";

const DATA_DIR = resolve(__dirname, "../data");
const PROCESSED = resolve(DATA_DIR, "processed.json");
const CONFIG = resolve(DATA_DIR, "groups-config.json");
const SEEDS_DRAFT = resolve(DATA_DIR, "team-seeds.draft.json");
const RESOLVE_OVERRIDES = resolve(DATA_DIR, "team-seeds-overrides.json");

// Per-event manual review decisions, loaded from data/team-seeds-overrides.json.
// Shape: { dropFragments: string[], confirmFragments?: string[] }
// All keys are case- and accent-insensitive.
// - dropFragments: raw mention strings the matcher should treat as unresolved
//   even if it finds a fuzzy match. Use when the matcher is wrong.
// - confirmFragments: raw mention strings whose match should be promoted to
//   "confirmed" confidence (any cluster they participate in becomes confirmed).
//   Use to silence the medium-confidence review on re-runs.
interface ResolveOverrides {
  dropFragments?: string[];
  confirmFragments?: string[];
}

function loadOverrides(): ResolveOverrides {
  if (!existsSync(RESOLVE_OVERRIDES)) return {};
  return JSON.parse(readFileSync(RESOLVE_OVERRIDES, "utf-8")) as ResolveOverrides;
}

// ── normalization ─────────────────────────────────────────────────────────

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function norm(s: string): string {
  return stripAccents(s).toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set([
  "me", "myself", "eu", "sozinho", "sozinha", "solo", "na", "nao", "no",
  "team", "time", "grupo", "with", "com", "and", "e", "vou", "tenho",
  "ainda", "applying", "as", "the", "still", "nenhum", "ninguem", "noone",
  "nobody", "n", "a", "o", "de", "do", "da", "dos", "das",
]);

function splitMentions(raw: string): string[] {
  // Strip leading labels like "Time Chaos:", "Team:", "Grupo:"
  const s = raw.replace(/^\s*(time|team|grupo|equipe)\s*[:\-]?\s*[A-Za-z0-9_\- ]{0,30}[:\-]/i, "");
  // Common separators
  const parts = s
    .split(/[,;\n\r\/\|]|(?:\s+(?:and|e|y|with|com|\+|&)\s+)/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts;
}

function isLikelyName(fragment: string): boolean {
  const n = norm(fragment);
  if (!n) return false;
  if (n.length < 2) return false;
  const tokens = n.split(" ").filter((t) => !STOPWORDS.has(t));
  if (tokens.length === 0) return false;
  // Must contain at least one token that looks like a name (letters only, len >= 2)
  return tokens.some((t) => /^[a-z]{2,}$/.test(t));
}

function nameTokens(fragment: string): string[] {
  return norm(fragment).split(" ").filter((t) => t && !STOPWORDS.has(t) && /^[a-z]+$/.test(t));
}

// ── matching ──────────────────────────────────────────────────────────────

interface Match {
  candidateId: string;
  confidence: "high" | "medium";
  reason: string;
  alternates?: string[]; // other candidate IDs that could plausibly match
}

interface IndexedCandidate {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  fullNorm: string;
  firstNorm: string;
  lastNorm: string;
  tokens: string[];
}

function indexCandidates(approved: Candidate[]): IndexedCandidate[] {
  return approved.map((c) => {
    const firstNorm = norm(c.firstName || "");
    const lastNorm = norm(c.lastName || "");
    const fullNorm = norm(c.name || `${c.firstName} ${c.lastName}`);
    const tokens = fullNorm.split(" ").filter(Boolean);
    return {
      id: c.id,
      name: c.name,
      firstName: c.firstName,
      lastName: c.lastName,
      firstNorm,
      lastNorm,
      fullNorm,
      tokens,
    };
  });
}

// Levenshtein distance (small inputs, simple impl)
function lev(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = Array.from({ length: bl + 1 }, (_, i) => i);
  for (let i = 1; i <= al; i++) {
    const curr = [i];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr.push(Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost));
    }
    prev = curr;
  }
  return prev[bl];
}

function findMatch(
  fragment: string,
  sourceId: string,
  index: IndexedCandidate[],
): Match | null {
  const toks = nameTokens(fragment);
  if (toks.length === 0) return null;

  const candidates = index.filter((c) => c.id !== sourceId);

  // Strategy 1: exact full name match (all fragment tokens are a subset of candidate tokens)
  const exactFullMatches = candidates.filter((c) => {
    return toks.every((t) => c.tokens.includes(t));
  });
  if (exactFullMatches.length === 1) {
    return { candidateId: exactFullMatches[0].id, confidence: "high", reason: "exact name match" };
  }
  if (exactFullMatches.length > 1 && toks.length >= 2) {
    // Multi-token fragment matching several candidates — pick best by token-count similarity
    const best = exactFullMatches.sort((a, b) => Math.abs(a.tokens.length - toks.length) - Math.abs(b.tokens.length - toks.length))[0];
    return {
      candidateId: best.id,
      confidence: "medium",
      reason: "multiple full-name matches, picked closest token count",
      alternates: exactFullMatches.map((c) => c.id).filter((id) => id !== best.id),
    };
  }

  // Strategy 2: first-name + (last name initial OR last name token)
  if (toks.length >= 2) {
    const [firstTok, ...rest] = toks;
    const lastTokenCandidates = candidates.filter(
      (c) => c.firstNorm === firstTok && rest.some((r) => c.tokens.includes(r) || c.lastNorm.startsWith(r)),
    );
    if (lastTokenCandidates.length === 1) {
      return { candidateId: lastTokenCandidates[0].id, confidence: "high", reason: "first + last token match" };
    }
    if (lastTokenCandidates.length > 1) {
      const best = lastTokenCandidates[0];
      return {
        candidateId: best.id,
        confidence: "medium",
        reason: `first '${firstTok}' + partial last; ${lastTokenCandidates.length} candidates`,
        alternates: lastTokenCandidates.map((c) => c.id).filter((id) => id !== best.id),
      };
    }
  }

  // Strategy 3: first-name only
  if (toks.length === 1) {
    const firstTok = toks[0];
    const firstNameMatches = candidates.filter((c) => c.firstNorm === firstTok);
    if (firstNameMatches.length === 1) {
      return { candidateId: firstNameMatches[0].id, confidence: "medium", reason: "single first-name hit" };
    }
    if (firstNameMatches.length > 1) {
      return {
        candidateId: firstNameMatches[0].id,
        confidence: "medium",
        reason: `${firstNameMatches.length} candidates share first name '${firstTok}'`,
        alternates: firstNameMatches.map((c) => c.id).slice(1),
      };
    }
  }

  // Strategy 4: fuzzy full-name (Levenshtein on full normalized name)
  const fragNorm = toks.join(" ");
  const fuzzy = candidates
    .map((c) => ({ c, dist: lev(fragNorm, c.fullNorm) }))
    .filter((x) => x.dist <= Math.max(2, Math.floor(fragNorm.length * 0.2)))
    .sort((a, b) => a.dist - b.dist);
  if (fuzzy.length === 1 || (fuzzy.length > 1 && fuzzy[0].dist < fuzzy[1].dist - 1)) {
    return { candidateId: fuzzy[0].c.id, confidence: "medium", reason: `fuzzy match (lev=${fuzzy[0].dist})` };
  }
  if (fuzzy.length > 1) {
    return {
      candidateId: fuzzy[0].c.id,
      confidence: "medium",
      reason: `ambiguous fuzzy match (lev=${fuzzy[0].dist})`,
      alternates: fuzzy.slice(1, 4).map((x) => x.c.id),
    };
  }

  return null;
}

// ── union-find for clustering ─────────────────────────────────────────────

class UF {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      return x;
    }
    let p = this.parent.get(x)!;
    while (p !== this.parent.get(p)) {
      this.parent.set(p, this.parent.get(this.parent.get(p)!)!);
      p = this.parent.get(p)!;
    }
    this.parent.set(x, p);
    return p;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

// ── candidate-key resolution ──────────────────────────────────────────────

let _cachedSampleKeys: Set<string> | null = null;
function sampleCandidateKeys(processed: ProcessedData): Set<string> {
  if (_cachedSampleKeys) return _cachedSampleKeys;
  const keys = new Set<string>();
  for (const c of processed.candidates) {
    for (const k of Object.keys(c)) keys.add(k);
    if (keys.size > 200) break;
  }
  _cachedSampleKeys = keys;
  return keys;
}

/**
 * Map a config value (either a form-label or a candidate-key) to the
 * candidate-key where its data lives.
 *
 * Lookup order:
 * 1. Exact match by `label` in `processed.schema.fields` → use `${key}Raw`
 *    if any candidate has that field, otherwise `key`.
 * 2. If the value already looks like a candidate-key (camelCase, no spaces)
 *    and appears on candidates, use it as-is.
 * Returns null if nothing resolves.
 */
function resolveCandidateKey(
  processed: ProcessedData,
  value: string | null,
): string | null {
  if (!value) return null;
  const keys = sampleCandidateKeys(processed);
  const field = processed.schema.fields.find((f) => f.label === value);
  if (field) {
    const rawKey = `${field.key}Raw`;
    if (keys.has(rawKey)) return rawKey;
    if (keys.has(field.key)) return field.key;
  }
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(value) && keys.has(value)) return value;
  return null;
}

// ── problem-track detection ───────────────────────────────────────────────

function detectProblem(raw: string, problemKeys: { key: string; label: string }[]): string | null {
  const n = norm(raw);
  for (const p of problemKeys) {
    if (n.includes(norm(p.label)) || n.includes(p.key)) return p.key;
  }
  return null;
}

// ── main ──────────────────────────────────────────────────────────────────

interface ReviewItem {
  sourceCandidateId: string;
  sourceName: string;
  rawMention: string;
  matchedCandidateId: string;
  matchedName: string;
  reason: string;
  alternateNames: string[];
}

function main(): void {
  const processed = JSON.parse(readFileSync(PROCESSED, "utf-8")) as ProcessedData;
  const config = JSON.parse(readFileSync(CONFIG, "utf-8")) as GroupsConfig;
  const overrides = loadOverrides();
  const dropFragments = new Set((overrides.dropFragments || []).map((s) => norm(s)));
  const confirmFragments = new Set((overrides.confirmFragments || []).map((s) => norm(s)));

  const approved = processed.candidates.filter((c) => c.approvalStatus === "approved");
  const byId = new Map(approved.map((c) => [c.id, c]));
  const index = indexCandidates(approved);

  // Resolve the team-mention candidate-key from the schema. The form column
  // header (config.preExistingTeamColumn) is matched against schema fields by
  // label; we then read `${field.key}Raw` when present (classified column) or
  // fall back to `field.key` (raw text column).
  const teamColField = resolveCandidateKey(processed, config.preExistingTeamColumn);
  if (!teamColField) {
    console.error(
      `\n  No candidate-key found for preExistingTeamColumn="${config.preExistingTeamColumn}". ` +
        `Check that the column label matches a field in data/processed.json#schema.fields. ` +
        `Skipping team resolution.\n`,
    );
  }

  const uf = new UF();
  const declaredProblemBySource = new Map<string, string>();
  const mentionsBySource: Record<string, { matched: { id: string; confidence: "high" | "medium" }[]; raw: string }> = {};
  // Unmatched mention fragments, per source. These either become a cluster's
  // externalMembers (if source clusters with someone) or top-level unresolved
  // (if source has no matches at all).
  const unmatchedBySource = new Map<string, string[]>();
  const review: ReviewItem[] = [];
  const confirmedSourceIds = new Set<string>();

  for (const c of approved) {
    if (!teamColField) break;
    const raw = String((c as Record<string, unknown>)[teamColField] ?? "").trim();
    if (!raw) continue;
    // Reject obvious "no team" answers
    if (/^(n\/?a|none|nenhum[ao]?|sozinh[ao]|solo|ainda n[aã]o|n[aã]o tenho|no team|s[oó]|so eu|me)$/i.test(raw)) continue;

    const declaredProb = detectProblem(raw, config.problems);
    if (declaredProb) declaredProblemBySource.set(c.id, declaredProb);

    const fragments = splitMentions(raw);
    const matched: { id: string; confidence: "high" | "medium" }[] = [];
    const unmatched: string[] = [];
    for (const frag of fragments) {
      if (!isLikelyName(frag)) continue;
      if (dropFragments.has(norm(frag))) {
        unmatched.push(frag);
        continue;
      }
      const m = findMatch(frag, c.id, index);
      if (!m) {
        unmatched.push(frag);
        continue;
      }
      const isConfirmed = confirmFragments.has(norm(frag));
      const effectiveConfidence: "high" | "medium" = isConfirmed ? "high" : m.confidence;
      matched.push({ id: m.candidateId, confidence: effectiveConfidence });
      uf.union(c.id, m.candidateId);
      if (isConfirmed) confirmedSourceIds.add(c.id);
      if (m.confidence === "medium" && !isConfirmed) {
        review.push({
          sourceCandidateId: c.id,
          sourceName: c.name,
          rawMention: frag,
          matchedCandidateId: m.candidateId,
          matchedName: byId.get(m.candidateId)?.name || "(unknown)",
          reason: m.reason,
          alternateNames: (m.alternates || []).map((id) => byId.get(id)?.name || id),
        });
      }
    }
    if (matched.length > 0) {
      mentionsBySource[c.id] = { matched, raw };
    }
    if (unmatched.length > 0) {
      unmatchedBySource.set(c.id, unmatched);
    }
  }

  // Pull declared problem from the optional declaration column (per-candidate
  // fixed-choice answer) for every approved candidate — not just those with
  // team mentions, since solo candidates can declare a problem too.
  // Accepts either a form-label or a candidate-key in config.
  if (config.problemDeclarationColumn) {
    const problemKey = resolveCandidateKey(processed, config.problemDeclarationColumn);
    if (problemKey) {
      for (const c of approved) {
        const raw = String((c as Record<string, unknown>)[problemKey] ?? "").trim();
        if (!raw) continue;
        const matched = detectProblem(raw, config.problems);
        if (matched) declaredProblemBySource.set(c.id, matched);
      }
    } else {
      console.error(
        `\n  No candidate-key found for problemDeclarationColumn="${config.problemDeclarationColumn}". Skipping problem declaration.\n`,
      );
    }
  }

  // Carry declared problems via clusters (use modal value if multiple agree)
  const problemCountsByRoot = new Map<string, Map<string, number>>();
  for (const [sourceId, prob] of declaredProblemBySource.entries()) {
    const root = uf.find(sourceId);
    if (!problemCountsByRoot.has(root)) problemCountsByRoot.set(root, new Map());
    const counts = problemCountsByRoot.get(root)!;
    counts.set(prob, (counts.get(prob) || 0) + 1);
  }

  // Build clusters from UF roots — but only include roots whose members include >=1 source
  const clustersByRoot = new Map<string, Set<string>>();
  const sourceIdsByRoot = new Map<string, Set<string>>();
  for (const sourceId of Object.keys(mentionsBySource)) {
    const root = uf.find(sourceId);
    if (!clustersByRoot.has(root)) clustersByRoot.set(root, new Set());
    if (!sourceIdsByRoot.has(root)) sourceIdsByRoot.set(root, new Set());
    clustersByRoot.get(root)!.add(sourceId);
    sourceIdsByRoot.get(root)!.add(sourceId);
    for (const m of mentionsBySource[sourceId].matched) {
      clustersByRoot.get(root)!.add(m.id);
    }
  }

  let clusterSeq = 1;
  const clusters: SeedCluster[] = [];
  const problemConflicts: { clusterId: string; members: string[]; problems: string[] }[] = [];

  for (const [root, members] of clustersByRoot.entries()) {
    const memberIds = [...members].sort();
    const sourceIds = [...(sourceIdsByRoot.get(root) || new Set())].sort();
    // Confidence: high if every match was high, otherwise medium
    let allHigh = true;
    for (const srcId of sourceIds) {
      for (const m of mentionsBySource[srcId].matched) {
        if (m.confidence !== "high") allHigh = false;
      }
    }
    // Modal declared problem; conflicts surfaced only when there's no clear winner
    const counts = problemCountsByRoot.get(root);
    let declaredProblem: string | null = null;
    if (counts && counts.size > 0) {
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const [topProb, topCount] = ranked[0];
      const tied = ranked.filter(([, n]) => n === topCount).length > 1;
      if (!tied) {
        declaredProblem = topProb;
      } else {
        problemConflicts.push({
          clusterId: `cluster-${clusterSeq}`,
          members: memberIds.map((id) => byId.get(id)?.name || id),
          problems: ranked.map(([p]) => p),
        });
      }
    }
    // Collect externalMembers from any source in this cluster who had
    // unmatched mentions — these are unregistered teammates.
    const externalSet = new Set<string>();
    for (const srcId of sourceIds) {
      const unmatched = unmatchedBySource.get(srcId);
      if (!unmatched) continue;
      for (const u of unmatched) {
        const trimmed = u.replace(/^[-•·\s]+/, "").trim();
        if (trimmed) externalSet.add(trimmed);
      }
    }
    const externalMembers = [...externalSet].sort();

    const clusterId = `cluster-${clusterSeq++}`;
    const baseConfidence: "high" | "medium" = allHigh ? "high" : "medium";
    const confirmed = sourceIds.some((id) => confirmedSourceIds.has(id));
    clusters.push({
      id: clusterId,
      candidateIds: memberIds,
      sourceCandidateIds: sourceIds,
      declaredProblem,
      confidence: confirmed ? "confirmed" : baseConfidence,
      ...(confirmed ? { notes: "Confirmed via team-seeds-overrides.json (confirmFragments)" } : {}),
      ...(externalMembers.length > 0 ? { externalMembers } : {}),
    });
  }

  // Top-level unresolved = unmatched mentions from sources that never landed
  // in any cluster (lone orphans).
  const unresolved: UnresolvedMention[] = [];
  for (const [sourceId, unmatched] of unmatchedBySource.entries()) {
    if (sourceId in mentionsBySource) continue; // belongs to a cluster
    for (const u of unmatched) {
      unresolved.push({ sourceCandidateId: sourceId, rawMention: u });
    }
  }

  const seeds: TeamSeeds = {
    resolvedAt: new Date().toISOString(),
    clusters,
    unresolved,
  };

  writeFileSync(SEEDS_DRAFT, JSON.stringify(seeds, null, 2));

  // Print review block to stdout for the slash command to surface to the user.
  console.log(JSON.stringify({
    summary: {
      approvedCandidates: approved.length,
      sourcesWithMentions: Object.keys(mentionsBySource).length,
      clusters: clusters.length,
      highConfidenceClusters: clusters.filter((c) => c.confidence === "high").length,
      mediumConfidenceClusters: clusters.filter((c) => c.confidence === "medium").length,
      unresolvedMentions: unresolved.length,
      oversizedClusters: clusters.filter((c) => c.candidateIds.length > config.targetSize).length,
    },
    mediumReviews: review,
    unresolved: unresolved.map((u) => ({
      sourceName: byId.get(u.sourceCandidateId)?.name || u.sourceCandidateId,
      raw: u.rawMention,
    })),
    problemConflicts,
    clustersPreview: clusters.map((c) => ({
      id: c.id,
      size: c.candidateIds.length,
      confidence: c.confidence,
      declaredProblem: c.declaredProblem,
      members: c.candidateIds.map((id) => byId.get(id)?.name || id),
    })),
  }, null, 2));
}

main();
