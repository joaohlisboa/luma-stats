import { NextResponse } from "next/server";
import { readJSON, writeJSON } from "@/lib/file-store";

export const dynamic = "force-dynamic";

type Overrides = Record<string, Record<string, string>>;

const FILE = "overrides.json";

export async function GET() {
  const data = await readJSON<Overrides>(FILE, {});
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isOverridesShape(payload)) {
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

function isOverridesShape(v: unknown): v is Overrides {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  for (const [, inner] of Object.entries(v as Record<string, unknown>)) {
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) return false;
    for (const [, val] of Object.entries(inner as Record<string, unknown>)) {
      if (typeof val !== "string") return false;
    }
  }
  return true;
}
