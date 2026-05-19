import { NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/file-store";

export const dynamic = "force-dynamic";

type Decisions = Record<string, "approved" | "declined">;

const FILE = "triage.json";

export async function GET() {
  const data = await readJSON<Decisions>(FILE, {});
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isDecisionsShape(payload)) {
    return NextResponse.json({ error: "Invalid payload shape" }, { status: 400 });
  }
  try {
    await writeJSON(FILE, payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "write failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function isDecisionsShape(v: unknown): v is Decisions {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  for (const [, val] of Object.entries(v as Record<string, unknown>)) {
    if (val !== "approved" && val !== "declined") return false;
  }
  return true;
}
