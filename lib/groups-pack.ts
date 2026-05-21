// Deterministic team-packing algorithm. Pure function — no I/O, no LLM.
// Used by the CLI (`pnpm groups:pack`) and the API route (Re-seed button).
// See docs/superpowers/specs/2026-05-20-groups-feature-design.md.

import type { Candidate } from "./types";
import type {
  CustomRule,
  Group,
  GroupsConfig,
  GroupsState,
  TeamSeeds,
  TechnicalConstraint,
  ValidationEntry,
  WeightedSumRule,
} from "./groups-types";

export interface PackInput {
  config: GroupsConfig;
  seeds: TeamSeeds;
  candidates: Candidate[];
  /** Optional prior state — used to preserve locked groups across re-seeds. */
  priorState?: GroupsState | null;
  /** If true, only include candidates with approvalStatus === "approved". Default true. */
  approvedOnly?: boolean;
}

type TechBucket = "technical" | "non-technical";

function bucketOf(c: Candidate, tc: TechnicalConstraint): TechBucket {
  const value = String(c[tc.dimensionKey] ?? "");
  if (tc.technicalValues.includes(value)) return "technical";
  // mixed and unknown both count as non-technical for the min-tech rule
  return "non-technical";
}

function countTech(memberIds: string[], byId: Map<string, Candidate>, tc: TechnicalConstraint): {
  technical: number;
  nonTechnical: number;
} {
  let technical = 0;
  let nonTechnical = 0;
  for (const id of memberIds) {
    const c = byId.get(id);
    if (!c) continue;
    if (bucketOf(c, tc) === "technical") technical++;
    else nonTechnical++;
  }
  return { technical, nonTechnical };
}

function makeGroupId(): string {
  return `group-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable sort key for pulling candidates from the pool. */
function poolSortKey(c: Candidate): [number, string] {
  const score = typeof c.relevanceScore === "number" ? -c.relevanceScore : 0;
  return [score, c.id];
}

function compareKeys(a: [number, string], b: [number, string]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1].localeCompare(b[1]);
}

/**
 * Pull the best candidate from `pool` that matches `preferTech`.
 * Returns the candidate's index in `pool`, or -1 if none match.
 * "Best" = highest relevanceScore (ties by id).
 */
function pickFromPool(
  pool: Candidate[],
  preferTech: TechBucket | null,
  tc: TechnicalConstraint,
): number {
  let bestIdx = -1;
  let bestKey: [number, string] | null = null;
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i];
    if (preferTech !== null && bucketOf(c, tc) !== preferTech) continue;
    const key = poolSortKey(c);
    if (bestKey === null || compareKeys(key, bestKey) < 0) {
      bestKey = key;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Pick any candidate (no tech preference), used as fallback when the preferred bucket is empty. */
function pickAny(pool: Candidate[]): number {
  if (pool.length === 0) return -1;
  let bestIdx = 0;
  let bestKey = poolSortKey(pool[0]);
  for (let i = 1; i < pool.length; i++) {
    const key = poolSortKey(pool[i]);
    if (compareKeys(key, bestKey) < 0) {
      bestKey = key;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Decide what to pull next for a group: aim to hit [minTechnical, maxTechnical].
 * Returns "technical", "non-technical", or null (either is fine).
 */
function nextPreference(
  technical: number,
  nonTechnical: number,
  remainingSlots: number,
  tc: TechnicalConstraint,
): TechBucket | null {
  const techDeficit = tc.minTechnical - technical;
  const techHeadroom = tc.maxTechnical - technical;
  if (techDeficit > 0 && techDeficit >= remainingSlots) return "technical";
  if (techHeadroom <= 0) return "non-technical";
  if (techDeficit > 0) return "technical";
  return null;
}

/**
 * Best-effort packer bias for halt-severity weighted-sum rules. Whenever such
 * a rule is in deficit, prefer pool candidates with positive weight — first
 * respecting tech preference, then ignoring it. If nothing helps, falls back
 * to the normal tech-preference pick. Simple/greedy; no backtracking.
 */
function pickWithRules(
  pool: Candidate[],
  preferTech: TechBucket | null,
  tc: TechnicalConstraint,
  byId: Map<string, Candidate>,
  group: Group,
  rules: CustomRule[] | undefined,
): number {
  const urgent: WeightedSumRule[] = [];
  if (rules) {
    for (const r of rules) {
      if (r.type !== "weighted-sum" || r.severity !== "halt") continue;
      if (r.min === undefined) continue;
      const cur = evalWeightedSum(group.memberIds, byId, r);
      if (cur < r.min) urgent.push(r);
    }
  }
  if (urgent.length === 0) return pickFromPool(pool, preferTech, tc);

  const scan = (respectTech: boolean): number => {
    let bestIdx = -1;
    let bestKey: [number, number, string] | null = null;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (respectTech && preferTech !== null && bucketOf(c, tc) !== preferTech) continue;
      let w = 0;
      for (const r of urgent) w += candidateWeight(c, r);
      if (w <= 0) continue;
      const [ps0, ps1] = poolSortKey(c);
      const key: [number, number, string] = [-w, ps0, ps1];
      if (bestKey === null || (key[0] !== bestKey[0] ? key[0] < bestKey[0] : compareKeys([key[1], key[2]], [bestKey[1], bestKey[2]]) < 0)) {
        bestKey = key;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  let idx = scan(true);
  if (idx !== -1) return idx;
  idx = scan(false);
  if (idx !== -1) return idx;
  return pickFromPool(pool, preferTech, tc);
}

function fillGroup(
  group: Group,
  pool: Candidate[],
  byId: Map<string, Candidate>,
  config: GroupsConfig,
): void {
  const tc = config.technicalConstraint;
  while (group.memberIds.length < config.targetSize && pool.length > 0) {
    const { technical, nonTechnical } = countTech(group.memberIds, byId, tc);
    const remaining = config.targetSize - group.memberIds.length;
    const pref = nextPreference(technical, nonTechnical, remaining, tc);
    let idx = pickWithRules(pool, pref, tc, byId, group, config.rules);
    if (idx === -1) idx = pickAny(pool);
    if (idx === -1) break;
    const [picked] = pool.splice(idx, 1);
    group.memberIds.push(picked.id);
  }
}

/**
 * Map a candidate's declared problem preference to a configured track key.
 * Returns null if the candidate didn't declare anything, the config has no
 * `problemDeclarationColumn`, or the value doesn't match any configured track.
 */
function candidateProblemKey(
  c: Candidate,
  config: GroupsConfig,
): string | null {
  if (!config.problemDeclarationColumn) return null;
  const raw = String(c[config.problemDeclarationColumn] ?? "").trim().toLowerCase();
  if (!raw) return null;
  const match = config.problems.find(
    (p) => p.key.toLowerCase() === raw || p.label.toLowerCase() === raw,
  );
  return match?.key ?? null;
}

/**
 * Pick a cluster's problem track by majority vote across its members, with
 * tie-break favoring the under-populated track (smaller `declaredCounts`).
 * Returns null when no member declared a recognized track.
 */
function chooseClusterProblem(
  memberIds: string[],
  byId: Map<string, Candidate>,
  config: GroupsConfig,
  declaredCounts: Map<string, number>,
): string | null {
  const counts = new Map<string, number>();
  for (const id of memberIds) {
    const c = byId.get(id);
    if (!c) continue;
    const k = candidateProblemKey(c, config);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 1 || sorted[0][1] > sorted[1][1]) return sorted[0][0];
  const tied = sorted.filter((e) => e[1] === sorted[0][1]).map((e) => e[0]);
  tied.sort((a, b) => (declaredCounts.get(a) ?? 0) - (declaredCounts.get(b) ?? 0));
  return tied[0];
}

function candidateWeight(c: Candidate, rule: WeightedSumRule): number {
  const v = String(c[rule.dimensionKey] ?? "");
  return rule.weights[v] ?? 0;
}

function evalWeightedSum(
  memberIds: string[],
  byId: Map<string, Candidate>,
  rule: WeightedSumRule,
): number {
  let total = 0;
  for (const id of memberIds) {
    const c = byId.get(id);
    if (c) total += candidateWeight(c, rule);
  }
  return total;
}

function validateRules(
  group: Group,
  byId: Map<string, Candidate>,
  rules: CustomRule[] | undefined,
): ValidationEntry[] {
  if (!rules || rules.length === 0) return [];
  const out: ValidationEntry[] = [];
  const label = `Group ${group.number}${group.problem ? ` (${group.problem})` : ""}`;
  for (const rule of rules) {
    if (rule.type === "weighted-sum") {
      const score = evalWeightedSum(group.memberIds, byId, rule);
      if (rule.min !== undefined && score < rule.min) {
        out.push({
          groupId: group.id,
          severity: rule.severity,
          code: "custom-rule",
          message: `${label} — ${rule.label}: score ${score} below min ${rule.min}.`,
        });
      }
      if (rule.max !== undefined && score > rule.max) {
        out.push({
          groupId: group.id,
          severity: rule.severity,
          code: "custom-rule",
          message: `${label} — ${rule.label}: score ${score} above max ${rule.max}.`,
        });
      }
    }
  }
  return out;
}

function validateGroup(
  group: Group,
  byId: Map<string, Candidate>,
  config: GroupsConfig,
  hadFillers: boolean,
): ValidationEntry[] {
  const tc = config.technicalConstraint;
  const { technical } = countTech(group.memberIds, byId, tc);
  const out: ValidationEntry[] = [];
  const label = `Group ${group.number}${group.problem ? ` (${group.problem})` : ""}`;

  if (group.memberIds.length > config.targetSize) {
    out.push({
      groupId: group.id,
      severity: "warn",
      code: "oversized-preexisting",
      message: `${label} has ${group.memberIds.length} members — pre-existing team kept intact, review manually.`,
    });
  } else if (group.memberIds.length < config.targetSize) {
    out.push({
      groupId: group.id,
      severity: "info",
      code: "undersized",
      message: `${label} has ${group.memberIds.length} of ${config.targetSize} members.`,
    });
  }

  // Imbalance is `info` only if every current member came from the seed (no
  // fillers added). Once we mix in fillers, the imbalance is the pack's fault
  // (or the user's, post-edit) so bump to `warn`.
  const severity = hadFillers ? "warn" : "info";
  if (technical < tc.minTechnical) {
    out.push({
      groupId: group.id,
      severity,
      code: "too-few-technical",
      message: `${label} has ${technical} technical (min ${tc.minTechnical}).`,
    });
  } else if (technical > tc.maxTechnical) {
    out.push({
      groupId: group.id,
      severity,
      code: "too-many-technical",
      message: `${label} has ${technical} technical (max ${tc.maxTechnical}).`,
    });
  }

  if (tc.haltOnAllNonTechnical && technical === 0 && group.memberIds.length > 0) {
    out.push({
      groupId: group.id,
      severity: "halt",
      code: "all-non-technical",
      message: `${label} has 0 technical members — fix before continuing.`,
    });
  }

  if (config.problems.length > 0 && !group.problem) {
    out.push({
      groupId: group.id,
      severity: "warn",
      code: "missing-problem",
      message: `${label} has no problem assigned.`,
    });
  }

  if (group.problem && config.problemDeclarationColumn) {
    const mismatched: string[] = [];
    for (const id of group.memberIds) {
      const c = byId.get(id);
      if (!c) continue;
      const k = candidateProblemKey(c, config);
      if (k && k !== group.problem) mismatched.push(c.name);
    }
    if (mismatched.length > 0) {
      out.push({
        groupId: group.id,
        severity: "info",
        code: "problem-mismatch",
        message: `${label} has ${mismatched.length} member(s) whose declared track differs: ${mismatched.join(", ")}.`,
      });
    }
  }

  out.push(...validateRules(group, byId, config.rules));

  return out;
}

/**
 * A group "has fillers" if any current member was not in its seed cluster's
 * candidateIds (or if it has no seed at all — fresh group).
 */
function computeHadFillers(
  group: Group,
  seedClusterMembersById: Map<string, Set<string>>,
): boolean {
  if (!group.seedClusterId) return true;
  const seedMembers = seedClusterMembersById.get(group.seedClusterId);
  if (!seedMembers) return true;
  return group.memberIds.some((id) => !seedMembers.has(id));
}

function renumber(groups: Group[]): void {
  // Global 1..N numbering. Locked groups keep priority (lowest numbers), then
  // existing-number order. Sorted in place so callers see the new order.
  groups.sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    return a.number - b.number;
  });
  groups.forEach((g, i) => {
    g.number = i + 1;
  });
}

export function packGroups(input: PackInput): GroupsState {
  const { config, seeds, candidates } = input;
  const approvedOnly = input.approvedOnly ?? true;

  const eligible = candidates.filter(
    (c) => !approvedOnly || c.approvalStatus === "approved",
  );
  const byId = new Map(eligible.map((c) => [c.id, c]));

  // Find candidate IDs that already live in locked groups; they are out of the pool.
  const lockedGroups: Group[] = [];
  const lockedMemberIds = new Set<string>();
  if (input.priorState) {
    for (const g of input.priorState.groups) {
      if (!g.locked) continue;
      const survivingMembers = g.memberIds.filter((id) => byId.has(id));
      if (survivingMembers.length === 0) continue;
      lockedGroups.push({ ...g, memberIds: survivingMembers });
      for (const id of survivingMembers) lockedMemberIds.add(id);
    }
  }

  // Build declared-problem counts across the eligible population. Used both as
  // the tiebreaker for split clusters (under-populated track wins) and as the
  // default track for clusters with zero declarations.
  const declaredCounts = new Map<string, number>();
  for (const c of eligible) {
    const k = candidateProblemKey(c, config);
    if (k) declaredCounts.set(k, (declaredCounts.get(k) ?? 0) + 1);
  }
  const trackByLoad = config.problems
    .map((p) => p.key)
    .sort((a, b) => (declaredCounts.get(a) ?? 0) - (declaredCounts.get(b) ?? 0));

  // Build seeded groups. Cluster problem is the member-majority vote (tied →
  // under-populated track). Falls back to the cluster's resolver-detected
  // problem if no member declared anything recognizable.
  const seedGroups: Group[] = [];
  const seededIds = new Set<string>(lockedMemberIds);
  let nextNum = 1;
  for (const cluster of seeds.clusters) {
    const members = cluster.candidateIds.filter(
      (id) => byId.has(id) && !seededIds.has(id),
    );
    if (members.length === 0) continue;
    for (const id of members) seededIds.add(id);
    const chosen =
      chooseClusterProblem(members, byId, config, declaredCounts) ??
      cluster.declaredProblem;
    seedGroups.push({
      id: makeGroupId(),
      number: nextNum++,
      problem: chosen,
      memberIds: members,
      locked: false,
      seedClusterId: cluster.id,
    });
  }

  // Pool = eligible candidates not yet placed.
  const placedIds = new Set<string>(seededIds);
  const pool = eligible.filter((c) => !placedIds.has(c.id));
  const minViableSize =
    config.minViableSize ?? Math.max(1, Math.ceil(config.targetSize / 2));

  // Hard problem-track constraint applies when the config tells us which
  // candidate field holds the declaration. Otherwise, fall back to the legacy
  // shared-pool round-robin behavior.
  const enforceTracks =
    config.problems.length > 0 && !!config.problemDeclarationColumn;

  const freshGroups: Group[] = [];
  if (enforceTracks) {
    // Partition pool by declared track. `null` bucket = undeclared / unrecognized.
    const poolByTrack = new Map<string | null, Candidate[]>();
    for (const p of config.problems) poolByTrack.set(p.key, []);
    poolByTrack.set(null, []);
    for (const c of pool) {
      const k = candidateProblemKey(c, config);
      poolByTrack.get(k)!.push(c);
    }

    // Fill seeded groups from their own track's pool only.
    for (const g of seedGroups) {
      if (g.memberIds.length >= config.targetSize) continue;
      const trackPool = g.problem ? poolByTrack.get(g.problem) : null;
      if (trackPool) fillGroup(g, trackPool, byId, config);
    }

    // Form fresh groups per track from the remaining track pool.
    for (const p of config.problems) {
      const trackPool = poolByTrack.get(p.key)!;
      while (trackPool.length > 0) {
        const group: Group = {
          id: makeGroupId(),
          number: nextNum++,
          problem: p.key,
          memberIds: [],
          locked: false,
          seedClusterId: null,
        };
        fillGroup(group, trackPool, byId, config);
        if (group.memberIds.length < minViableSize) {
          for (const id of group.memberIds) {
            const c = byId.get(id);
            if (c) trackPool.push(c);
          }
          break;
        }
        freshGroups.push(group);
      }
    }

    // Residual undeclared: slot into any existing group with capacity,
    // preferring the under-populated track. Anything that doesn't fit stays
    // unassigned for the user to place manually.
    const undeclared = poolByTrack.get(null)!;
    if (undeclared.length > 0) {
      const orderedTracks = trackByLoad; // ascending declared population
      const candidateGroups = [...seedGroups, ...freshGroups];
      for (const c of undeclared.splice(0)) {
        let placed = false;
        for (const track of orderedTracks) {
          const g = candidateGroups.find(
            (g) => g.problem === track && g.memberIds.length < config.targetSize,
          );
          if (g) {
            g.memberIds.push(c.id);
            placed = true;
            break;
          }
        }
        if (!placed) undeclared.push(c);
      }
    }
  } else {
    // Legacy path: single shared pool, round-robin tracks for fresh groups.
    for (const g of seedGroups) {
      if (g.memberIds.length >= config.targetSize) continue;
      fillGroup(g, pool, byId, config);
    }
    let problemIdx = 0;
    while (pool.length > 0) {
      const problem =
        config.problems.length > 0
          ? config.problems[problemIdx % config.problems.length].key
          : null;
      problemIdx++;
      const group: Group = {
        id: makeGroupId(),
        number: nextNum++,
        problem,
        memberIds: [],
        locked: false,
        seedClusterId: null,
      };
      fillGroup(group, pool, byId, config);
      if (group.memberIds.length < minViableSize) {
        for (const id of group.memberIds) {
          const c = byId.get(id);
          if (c) pool.push(c);
        }
        break;
      }
      freshGroups.push(group);
    }
  }

  const allGroups: Group[] = [...lockedGroups, ...seedGroups, ...freshGroups];
  renumber(allGroups);

  // Map cluster id → its original candidateIds for hadFillers checks.
  const seedClusterMembersById = new Map<string, Set<string>>();
  for (const c of seeds.clusters) {
    seedClusterMembersById.set(c.id, new Set(c.candidateIds));
  }
  const validation: ValidationEntry[] = [];
  for (const g of allGroups) {
    const hadFillers = computeHadFillers(g, seedClusterMembersById);
    validation.push(...validateGroup(g, byId, config, hadFillers));
  }

  // Anything in the eligible set not yet placed is unassigned (happens when
  // pool can't form a full group at the end, or when oversized seeds spill
  // members past targetSize — actually they stay together, so unassigned only
  // accumulates when freshGroups stops with members still in pool).
  const finalPlaced = new Set<string>();
  for (const g of allGroups) for (const id of g.memberIds) finalPlaced.add(id);
  const unassigned = eligible.filter((c) => !finalPlaced.has(c.id)).map((c) => c.id);

  return {
    updatedAt: new Date().toISOString(),
    groups: allGroups,
    unassigned,
    validation,
  };
}

/**
 * Recompute validation for a manually-edited state without re-running the pack.
 * Used by the API on every PUT so the client can't poison validation.
 */
export function revalidate(
  state: GroupsState,
  config: GroupsConfig,
  seeds: TeamSeeds,
  candidates: Candidate[],
): ValidationEntry[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seedClusterMembersById = new Map<string, Set<string>>();
  for (const c of seeds.clusters) {
    seedClusterMembersById.set(c.id, new Set(c.candidateIds));
  }
  const out: ValidationEntry[] = [];
  for (const g of state.groups) {
    const hadFillers = computeHadFillers(g, seedClusterMembersById);
    out.push(...validateGroup(g, byId, config, hadFillers));
  }
  return out;
}
