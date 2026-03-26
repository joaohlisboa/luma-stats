import type { ProcessedData } from "./types";

let cachedData: ProcessedData | null = null;
let loadAttempted = false;

export function loadData(): ProcessedData | null {
  if (loadAttempted) return cachedData;
  loadAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedData = require("../data/processed.json") as ProcessedData;
  } catch {
    cachedData = null;
  }

  return cachedData;
}
