---
description: Enable the optional Groups module for this event — set constraints, fuzzy-resolve pre-existing teams, generate initial team assignments.
---

# /groups-setup

You are configuring the optional Groups module of luma-stats for the current event. This is an interactive setup: ask questions one at a time, then perform fuzzy name resolution against the candidate list, then invoke the deterministic packer.

**Critical rule: do NOT proceed to fuzzy resolution until the user has confirmed every constraint question.** Constraints first, resolution second, pack third.

## What you produce

By the end of this command, three files must exist in `data/`:

1. `data/groups-config.json` — declarative constraints
2. `data/team-seeds.json` — clusters of candidate IDs representing pre-existing teams
3. `data/groups.json` — initial team assignments (produced by `pnpm groups:pack`)

Shapes are defined in `lib/groups-types.ts`. Read it before writing JSON to make sure you match the schema exactly.

## Workflow

### Step 0 — Preconditions

Check that `data/processed.json` exists. If not, stop and tell the user to run `pnpm process` first.

Read `data/processed.json` to understand:
- `meta.customColumns` — these are candidate-supplied form questions, one might mention teammates
- `meta.candidateCount`
- `schema.triageDimensions` — confirms what dimension keys exist (look for `technicality`)
- `candidates[]` — full candidate list, used for fuzzy matching later

**Approved-only scope.** Teams are formed from candidates with `approvalStatus === "approved"` only. Filter the candidate list accordingly *before* fuzzy resolution — a waitlisted candidate mentioning an approved person, or vice versa, must not seed a cluster. If a mention only resolves to a non-approved candidate, drop it (move to `unresolved` with a note). `packGroups` already enforces `approvedOnly: true` downstream, but doing the filter upstream keeps the seeds file honest and prevents zombie cluster members.

If `data/groups-config.json` already exists, ask the user: "Groups module is already configured. Re-run from scratch (overwrite), update only seeds (re-run fuzzy resolution against fresh data), or cancel?"

### Step 1 — Identify the team-mention column

Inspect `meta.customColumns` for the original form header, AND `candidates[0]` keys for the corresponding candidate-key. The LLM classify step often renames columns — the original header is "If you're applying as a team, list your teammates' full names below…" but the candidate key may end up something like `teamSizeRaw` or `teammatesRaw`. Match them by sampling: pick a candidate whose original answer you can see in the CSV, then find which camelCase key on `candidates[0]` holds that answer.

Show the user the form header AND the resolved candidate-key, plus 2-3 sample values. Ask them to confirm. Then write the **candidate-key** (not the form header) to `preExistingTeamColumn`.

If no team-mention column applies, set `preExistingTeamColumn: null` and `seeds.clusters: []` — every candidate goes into the pool, no pre-existing teams. Skip Step 4.

### Key conventions

All four column references in the config are **candidate-keys** (camelCase, as seen on `candidates[0]`), never form-column labels:

- `preExistingTeamColumn` — usually `${classifiedKey}Raw`, e.g. `teamSizeRaw`
- `problemDeclarationColumn` — usually the field key itself, e.g. `whichProblemInterestsYouMost`
- `technicalConstraint.dimensionKey` — the classified dimension, e.g. `technicality`
- `secondaryDot.dimensionKey` — any categorical key, e.g. `whichClaudePlanAreYouCurrentlyIn`

The resolver and runtime read these directly; nothing translates labels at runtime. Inspect `data/processed.json#candidates[0]` to verify each key exists before writing it.

### Step 2 — Constraint questions

Ask one at a time. Default values shown in brackets.

1. **Problem tracks.** "Does this event split teams across problem tracks (e.g. Security vs Healthcare)? If yes, list the tracks comma-separated. If no, type 'none'."
   → Produces `problems: []` or `problems: [{key, label}, ...]`. Use the user's typed label as `label`; derive `key` as a lowercase slug.

2. **Target team size.** "Target team size? [5]"
   → `targetSize`

3. **Technicality dimension.** Verify that `technicality` exists in `schema.triageDimensions`. If yes, confirm with user: "I'll use the `technicality` dimension with values Technical / Non-technical / Mixed-Unclear. OK?" If user disagrees or dimension is missing, ask which dimension to use and which of its categories count as technical.
   → `technicalConstraint.dimensionKey`, `technicalValues`, `nonTechnicalValues`, `mixedValues`

4. **Min/max technical per team.** "Minimum and maximum technical members per team? [2 / 3]"
   → `minTechnical`, `maxTechnical`

5. **Halt on all-non-technical.** "Halt (red banner) if any team has zero technical members? [yes]"
   → `haltOnAllNonTechnical`

6. **Secondary dot (optional).** "Want a second colored dot under each member's tech dot — e.g. Claude plan tier, seniority, anything categorical? [skip / yes]" If yes, ask:
   - "Which candidate field?" Inspect `candidates[0]` keys to propose options (e.g. `whichClaudePlanAreYouCurrentlyIn`, `experienceLevel`).
   - "Map each value to a color." For each distinct value in the field, the user picks a color as a CSS string (hex/rgb/named). Sensible defaults to offer: red `#ef4444`, amber `#f59e0b`, green `#10b981`, slate `#64748b`. Also ask for a fallback color for unknown/null.
   → `secondaryDot: { dimensionKey, label?, values: [{ value, color, label? }], fallbackColor? }`. Skip the whole block if user said skip.

7. **Custom composition rules (optional).** "Any extra rules per group? Examples: ≥ 1 Max-plan user, every group needs ≥ 4 'power points' (Max=2, Pro=1), no more than 2 students. [skip / yes]" If yes, loop:
   - **Shape**: only `weighted-sum` is supported today. Tell the user: each member contributes a weight based on a field value; group total must satisfy a min and/or max.
   - **Field** (`dimensionKey`): inspect `candidates[0]` keys, propose categorical ones.
   - **Weights**: list the distinct values for that field (from `processed.json`), ask the user to assign a number to each (default 0, can skip a value). Example for plans: `{ "Max": 2, "Pro": 1 }` — values not in the map count as 0.
   - **Threshold**: ask `min` and/or `max` (either is optional, but at least one is required).
   - **Severity**: `halt` = mandatory (red banner, packer will best-effort try to satisfy), `warn` = best-effort, `info` = informational only.
   - **Label**: short human-readable name for messages (e.g. "Plan coverage").
   - Echo the rule back in plain English (e.g. "Each group must have plan-coverage score ≥ 4, where Max=2 and Pro=1. Severity: halt."), confirm, append to `rules` array. Ask "add another?"
   → `rules: [{ id, label, type: "weighted-sum", dimensionKey, weights, min?, max?, severity }]`. Skip the whole block if user said skip; `rules` is optional in the schema.

Write `data/groups-config.json` after all answers collected. Use `lib/file-store.ts`-style atomic write if you can, otherwise plain JSON.stringify with 2-space indent is fine.

### Step 3 — Confirm before resolution

Show the user a summary of the config. Get explicit "go" before starting fuzzy resolution — that step is the only token-expensive part.

### Step 4 — Fuzzy team resolution

Run `pnpm groups:resolve` — the generic resolver in `scripts/groups-resolve.ts`. It reads `data/processed.json` + `data/groups-config.json` + (optionally) `data/team-seeds-overrides.json`, and writes `data/team-seeds.draft.json` plus a JSON review block to stdout. Approved candidates only (Step 0 rule).

How the resolver works (so you can explain it to the user, not so you reimplement it):
- Parses messy answers ("Pedro, Marina K.", "we're with Tabata's team", "ana + bea + me", "Time Chaos: João, Maria, Pedro") into name fragments.
- Matches each fragment against the approved list using exact full-name, first+last-initial, first-name-only, and Levenshtein-based fuzzy match.
- Builds clusters with union-find — if A mentions B and B mentions C, all three end up in one cluster. The mentioning candidate is always part of their own cluster.
- Detects problem-track mentions by scanning the raw text for configured problem labels/keys.
- Confidence per cluster: `high` if every match was exact/unambiguous, `medium` if any fuzzy guess was needed, `confirmed` if the user confirmed via the overrides file.
- Anything it can't confidently match (or that's blocked by `dropFragments`) lands in `unresolved`.

**Surface the stdout review block to the user.** Then collect their decisions on:
1. Every `mediumReviews` entry — does the fuzzy match look right?
2. Every `oversizedClusters` flag — does the team actually have N+ people, or did a bad fuzzy match merge two real teams?
3. Every `problemConflicts` entry — which problem track does this cluster pick?
4. Any obvious wrong matches in `clustersPreview` (rare, but worth a glance).

**Encode their answers into `data/team-seeds-overrides.json`.** Schema:

```json
{
  "dropFragments": ["Jane Doe", "John Smith"],
  "confirmFragments": ["Alex Example"]
}
```

- `dropFragments`: raw mention strings (case- and accent-insensitive) the matcher should treat as unresolved — use when a fuzzy match is wrong (e.g. "Smith" ≠ "Smyth").
- `confirmFragments`: raw mention strings whose match should be promoted to `confirmed` confidence — silences the medium-review on re-runs.

Re-run `pnpm groups:resolve` until the review block is clean (no unwanted medium matches, no false merges). Then promote `data/team-seeds.draft.json` → `data/team-seeds.json` (a simple `mv`).

**Never hand-edit `team-seeds.json`** with event-specific decisions; everything goes through `team-seeds-overrides.json` so the resolver remains deterministic and reproducible across re-runs.

### Step 5 — Pack

Run `pnpm groups:pack` via Bash. This reads the three artifacts and produces `data/groups.json`.

If the pack reports halts (zero-technical teams), tell the user: "Pack succeeded but N groups have zero technical members. Open `/#groups` in the dashboard to rebalance — drag members between teams." Don't try to auto-fix.

### Step 6 — Hand off

Tell the user:
- Where to find the files (config, seeds, state)
- How many groups were created
- How to access: `pnpm dev`, then open `http://localhost:3000/#groups`
- Reminder: edits in the UI persist to `data/groups.json` automatically; the seeds file is the durable source of "who's already partnered with whom" and is only rewritten when `/groups-setup` runs again.

## Re-run behavior

If `data/groups-config.json` and `data/team-seeds.json` already exist and the user chose "update only seeds":

- Keep `groups-config.json` as is.
- Re-read the team-mention column.
- Diff against existing `team-seeds.json`:
  - Existing clusters with `confidence: "confirmed"` are kept verbatim.
  - New mentions (from candidates added since last run) are resolved and merged.
  - Mentions that disappeared (candidate withdrew) → cluster shrinks; if empty, drop it.
- Write seeds, then run `pnpm groups:pack`. The pack respects `locked: true` flags on the prior `groups.json` so manual edits in the UI survive.

## Don't

- Don't ever write `groups.json` by hand. Always go through `pnpm groups:pack` so validation is computed correctly.
- Don't auto-split oversized pre-existing teams (e.g. 6 friends who registered together). Keep them as one oversized cluster with a `warn` validation — let the user split via the UI.
- Don't dedupe candidates across multiple clusters silently. If a person ends up in two clusters, surface the conflict and ask the user to pick one.
- Don't skip the constraint questions just because the user is impatient. Without them the pack will produce nonsense.
