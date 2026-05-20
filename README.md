# Luma Stats

Dashboard for Claude ambassadors to triage Luma event registrations.

Drop your CSV, run one command, get charts, triage tools, an approved list, and an optional team-organization board.

![Dashboard view](docs/dashboard.png)

![Triage balance tracking](docs/triage.png)

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS), [pnpm](https://pnpm.io/), [Claude CLI](https://docs.anthropic.com/en/docs/claude-code)

## Quick Start

```bash
git clone <this-repo> && cd luma-stats && pnpm install
# Export your Luma guest list as CSV → data/list.csv
pnpm process    # Claude classifies and scores candidates → data/processed.json
pnpm dev        # http://localhost:3000
```

## How It Works

`pnpm process` calls Claude CLI to:

- Detect Luma vs custom form columns
- Classify qualitative fields (roles, industries, interests)
- Infer synthetic dimensions: **gender** (from name), **technicality** (Technical / Non-technical / Mixed-Unclear), **industry** (sector from workplace)
- Compute a 0–100 relevance score
- Decide which charts to show
- Output `data/processed.json`

## Views

- **Dashboard** — Charts and stats
- **Triage** — Approve/decline with balance tracking
- **Approved** — Filterable table; category badges are click-to-reassign dropdowns (overrides persist per event)
- **Groups** *(opt-in)* — Team organization board; see [Groups (workshops & hackathons)](#groups-workshops--hackathons)

## Updating Data

Re-export CSV, replace `data/list.csv`, then:

- `pnpm process:update` — only classifies new candidates; refreshes Luma fields for the rest
- `pnpm process` — re-design categories from scratch (form questions changed)
- `pnpm reprocess` — rebuild from cache without any LLM calls

Triage decisions and category overrides persist to `data/triage.json` / `data/overrides.json` via the app's API. They survive re-processing.

## Groups (workshops & hackathons)

Optional 4th view for events that need teams. Hidden by default; enabled by running `/groups-setup` in Claude Code at the project root.

The slash command interactively:

1. Asks constraints — problems (e.g. Security / Healthcare), team size, min/max technical per team, optional secondary signal (e.g. Claude plan tier shown as a colored dot)
2. Identifies the team-mention column from your form
3. Runs `pnpm groups:resolve` — deterministic fuzzy name matching with union-find clustering (uses `data/team-seeds-overrides.json` for manual confirms/drops)
4. Runs `pnpm groups:pack` — packs seeds, balances technical count, validates

Produces three files in `data/`: `groups-config.json`, `team-seeds.json`, `groups.json`.

UI: drag-and-drop board, per-group lock, problem chips, swap popover, halts on zero-technical teams, CSV export. Re-pack any time via the "Re-seed" button or `pnpm groups:pack` — locked groups are preserved.

## Deploying to Vercel

Vercel's filesystem is read-only at runtime, so deploy as a read-only snapshot — do curation locally.

1. Force-add the snapshot you want public: `git add -f data/processed.json data/overrides.json data/triage.json` (and `data/groups-config.json data/groups.json` if using Groups)
2. Commit and connect to Vercel
3. **Protect access** with [Vercel Password Protection](https://vercel.com/docs/security/password-protection) or your own auth — the UI shows names, emails, and LinkedIn URLs by design

## PII

`.gitignore` covers all of `data/` by default. **Never force-add** any of:

- `data/list.csv` — raw export
- `data/team-seeds.json`, `data/team-seeds.draft.json`, `data/team-seeds-overrides.json` — raw name mentions
- `data/llm-cache.json` — cached LLM responses keyed by candidate ID

## Custom Form Questions

Claude analyzes each custom column and renders it as filter chips, charts, detail fields, or yes/no filters. Customize via `scripts/prompt.md`.
