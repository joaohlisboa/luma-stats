// CLI wrapper around lib/groups-pack. Reads the three optional artifacts,
// runs the deterministic pack, writes data/groups.json.
//
// Used by the /groups-setup slash command after fuzzy resolution, and
// available standalone via `pnpm groups:pack`.

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type {
  GroupsConfig,
  GroupsState,
  TeamSeeds,
} from "../lib/groups-types";
import type { ProcessedData } from "../lib/types";
import { packGroups } from "../lib/groups-pack";

const DATA_DIR = resolve(__dirname, "../data");
const PROCESSED = resolve(DATA_DIR, "processed.json");
const CONFIG = resolve(DATA_DIR, "groups-config.json");
const SEEDS = resolve(DATA_DIR, "team-seeds.json");
const STATE = resolve(DATA_DIR, "groups.json");

function requireFile(path: string, hint: string): void {
  if (!existsSync(path)) {
    console.error(`\n  Missing ${path}.`);
    console.error(`  ${hint}\n`);
    process.exit(1);
  }
}

function main(): void {
  requireFile(PROCESSED, "Run `pnpm process` first.");
  requireFile(
    CONFIG,
    "Run the `/groups-setup` slash command to enable the Groups module.",
  );
  requireFile(
    SEEDS,
    "Run the `/groups-setup` slash command to enable the Groups module.",
  );

  const processed = JSON.parse(readFileSync(PROCESSED, "utf-8")) as ProcessedData;
  const config = JSON.parse(readFileSync(CONFIG, "utf-8")) as GroupsConfig;
  const seeds = JSON.parse(readFileSync(SEEDS, "utf-8")) as TeamSeeds;
  const priorState = existsSync(STATE)
    ? (JSON.parse(readFileSync(STATE, "utf-8")) as GroupsState)
    : null;

  const state = packGroups({
    config,
    seeds,
    candidates: processed.candidates,
    priorState,
  });

  writeFileSync(STATE, JSON.stringify(state, null, 2));

  console.log(`\n  Packed ${state.groups.length} groups.`);
  console.log(`  Unassigned: ${state.unassigned.length}`);
  const bySeverity = state.validation.reduce<Record<string, number>>(
    (acc, v) => ({ ...acc, [v.severity]: (acc[v.severity] || 0) + 1 }),
    {},
  );
  console.log(
    `  Validation: ${bySeverity.halt || 0} halt · ${bySeverity.warn || 0} warn · ${bySeverity.info || 0} info`,
  );
  console.log(`\n  Wrote data/groups.json. Open /#groups in the dashboard.\n`);
}

main();
