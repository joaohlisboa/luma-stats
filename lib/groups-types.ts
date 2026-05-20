// Types for the optional Groups module.
// All three artifacts (config, seeds, state) live under data/ and are absent
// when the module is disabled — the API returns null in that case.

export interface ProblemTrack {
  key: string;
  label: string;
}

/**
 * Optional second dot rendered under each member chip's tech dot. Generic
 * categorical signal (Claude plan, seniority, etc.). Colors are CSS strings
 * (hex, rgb, named) — applied as inline style so Tailwind's content scan
 * doesn't need to know about them.
 */
export interface SecondaryDotConfig {
  dimensionKey: string;
  label?: string;
  values: { value: string; color: string; label?: string }[];
  fallbackColor?: string;
}

export interface TechnicalConstraint {
  dimensionKey: string;
  technicalValues: string[];
  nonTechnicalValues: string[];
  mixedValues: string[];
  minTechnical: number;
  maxTechnical: number;
  haltOnAllNonTechnical: boolean;
}

export interface GroupsConfig {
  targetSize: number;
  /** Minimum members for a non-seeded group to commit. Defaults to ceil(targetSize/2). */
  minViableSize?: number;
  problems: ProblemTrack[];
  technicalConstraint: TechnicalConstraint;
  preExistingTeamColumn: string | null;
  /**
   * Optional candidate-key (camelCase, as stored on Candidate) whose value is
   * the candidate's declared problem-track preference. When set, the resolver
   * carries the modal value across a cluster into `declaredProblem`.
   */
  problemDeclarationColumn?: string | null;
  /** Optional secondary dot rendered under each member chip's tech dot. */
  secondaryDot?: SecondaryDotConfig;
}

export type SeedConfidence = "confirmed" | "high" | "medium";

export interface SeedCluster {
  id: string;
  candidateIds: string[];
  sourceCandidateIds: string[];
  declaredProblem: string | null;
  confidence: SeedConfidence;
  notes?: string;
  /**
   * Names mentioned by cluster members that didn't match any registered
   * candidate — i.e. unregistered teammates. UI surfaces these so the user
   * knows the team has off-list members.
   */
  externalMembers?: string[];
}

export interface UnresolvedMention {
  sourceCandidateId: string;
  rawMention: string;
}

export interface TeamSeeds {
  resolvedAt: string;
  clusters: SeedCluster[];
  unresolved: UnresolvedMention[];
}

export interface Group {
  id: string;
  number: number;
  problem: string | null;
  memberIds: string[];
  locked: boolean;
  seedClusterId: string | null;
}

export type ValidationSeverity = "info" | "warn" | "halt";
export type ValidationCode =
  | "oversized-preexisting"
  | "too-few-technical"
  | "too-many-technical"
  | "all-non-technical"
  | "undersized"
  | "missing-problem";

export interface ValidationEntry {
  groupId: string;
  severity: ValidationSeverity;
  code: ValidationCode;
  message: string;
}

export interface GroupsState {
  updatedAt: string;
  groups: Group[];
  unassigned: string[];
  validation: ValidationEntry[];
}

export interface GroupsBundle {
  config: GroupsConfig;
  seeds: TeamSeeds;
  state: GroupsState;
}
