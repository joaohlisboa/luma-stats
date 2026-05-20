import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { readJSON, writeJSON } from "@/lib/file-store";
import type {
  GroupsBundle,
  GroupsConfig,
  GroupsState,
  TeamSeeds,
} from "@/lib/groups-types";
import type { ProcessedData } from "@/lib/types";
import { packGroups, revalidate } from "@/lib/groups-pack";

export const dynamic = "force-dynamic";

const CONFIG_FILE = "groups-config.json";
const SEEDS_FILE = "team-seeds.json";
const STATE_FILE = "groups.json";

function readProcessed(): ProcessedData | null {
  const path = resolve(process.cwd(), "data", "processed.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ProcessedData;
  } catch {
    return null;
  }
}

async function loadBundle(): Promise<GroupsBundle | null> {
  const config = await readJSON<GroupsConfig | null>(CONFIG_FILE, null);
  const seeds = await readJSON<TeamSeeds | null>(SEEDS_FILE, null);
  if (!config || !seeds) return null;
  let state = await readJSON<GroupsState | null>(STATE_FILE, null);
  if (!state) {
    const processed = readProcessed();
    if (!processed) return null;
    state = packGroups({ config, seeds, candidates: processed.candidates });
    await writeJSON(STATE_FILE, state);
  }
  return { config, seeds, state };
}

export async function GET() {
  const bundle = await loadBundle();
  return NextResponse.json(bundle);
}

export async function PUT(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isGroupsStateShape(payload)) {
    return NextResponse.json({ error: "Invalid state shape" }, { status: 400 });
  }
  const config = await readJSON<GroupsConfig | null>(CONFIG_FILE, null);
  const seeds = await readJSON<TeamSeeds | null>(SEEDS_FILE, null);
  if (!config || !seeds) {
    return NextResponse.json({ error: "Groups module not enabled" }, { status: 400 });
  }
  const processed = readProcessed();
  if (!processed) {
    return NextResponse.json({ error: "processed.json missing" }, { status: 400 });
  }
  // Server recomputes validation; client cannot poison it.
  const next: GroupsState = {
    updatedAt: new Date().toISOString(),
    groups: payload.groups,
    unassigned: payload.unassigned,
    validation: revalidate(payload, config, seeds, processed.candidates),
  };
  try {
    await writeJSON(STATE_FILE, next);
    return NextResponse.json({ ok: true, state: next });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "write failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("action") !== "reseed") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const config = await readJSON<GroupsConfig | null>(CONFIG_FILE, null);
  const seeds = await readJSON<TeamSeeds | null>(SEEDS_FILE, null);
  if (!config || !seeds) {
    return NextResponse.json({ error: "Groups module not enabled" }, { status: 400 });
  }
  const processed = readProcessed();
  if (!processed) {
    return NextResponse.json({ error: "processed.json missing" }, { status: 400 });
  }
  const priorState = await readJSON<GroupsState | null>(STATE_FILE, null);
  const state = packGroups({
    config,
    seeds,
    candidates: processed.candidates,
    priorState,
  });
  try {
    await writeJSON(STATE_FILE, state);
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "write failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function isGroupsStateShape(v: unknown): v is GroupsState {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  if (!Array.isArray(obj.groups)) return false;
  if (!Array.isArray(obj.unassigned)) return false;
  for (const g of obj.groups) {
    if (typeof g !== "object" || g === null) return false;
    const grp = g as Record<string, unknown>;
    if (typeof grp.id !== "string") return false;
    if (typeof grp.number !== "number") return false;
    if (grp.problem !== null && typeof grp.problem !== "string") return false;
    if (!Array.isArray(grp.memberIds)) return false;
    if (typeof grp.locked !== "boolean") return false;
    if (grp.seedClusterId !== null && typeof grp.seedClusterId !== "string")
      return false;
    for (const id of grp.memberIds) if (typeof id !== "string") return false;
  }
  for (const u of obj.unassigned) if (typeof u !== "string") return false;
  return true;
}
