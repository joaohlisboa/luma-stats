/**
 * Small JSON file store under data/.
 *
 * Used by the overrides + triage API routes to persist user curation
 * to disk instead of browser localStorage. Atomic writes (temp + rename)
 * to avoid corruption if the dev server is killed mid-write.
 *
 * Server-side only — must not be imported from client components.
 */

import { readFile, writeFile, rename, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";

const DATA_DIR = resolve(process.cwd(), "data");

export async function readJSON<T>(filename: string, fallback: T): Promise<T> {
  const path = resolve(DATA_DIR, filename);
  if (!existsSync(path)) return fallback;
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function writeJSON(filename: string, data: unknown): Promise<void> {
  const path = resolve(DATA_DIR, filename);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmp, path);
}
