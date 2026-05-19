import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Candidate, ProcessedData } from "./types";

type Overrides = Record<string, Record<string, string>>;

const API = "/api/overrides";
const LEGACY_PREFIX = "overrides-";
const DEBOUNCE_MS = 300;

/**
 * Read all legacy `overrides-{hash}` entries from localStorage and merge
 * them into a single object. Used once on first load when the server file
 * is empty, so existing in-browser edits aren't lost when migrating to disk.
 */
function readLegacyLocalStorage(): Overrides | null {
  try {
    const merged: Overrides = {};
    let found = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LEGACY_PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Overrides;
      for (const [id, fields] of Object.entries(parsed)) {
        merged[id] = { ...(merged[id] || {}), ...fields };
      }
      found = true;
    }
    return found ? merged : null;
  } catch {
    return null;
  }
}

export function useOverrides(data: ProcessedData) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const dirty = useRef(false);

  // Initial load: fetch from disk, auto-migrate from legacy localStorage if empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API);
        const server = res.ok ? ((await res.json()) as Overrides) : {};

        if (Object.keys(server).length === 0) {
          const legacy = readLegacyLocalStorage();
          if (legacy && Object.keys(legacy).length > 0) {
            await fetch(API, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(legacy),
            });
            if (!cancelled) {
              setOverrides(legacy);
              console.info(
                `[overrides] migrated ${Object.keys(legacy).length} entries from localStorage to data/overrides.json`,
              );
            }
          }
        } else if (!cancelled) {
          setOverrides(server);
        }
      } catch (err) {
        console.warn("[overrides] failed to load from server", err);
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced persistence: any time `overrides` changes after hydration,
  // schedule a PUT to the API.
  useEffect(() => {
    if (!isHydrated || !dirty.current) return;
    const t = setTimeout(() => {
      fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      }).catch((err) => {
        console.warn("[overrides] save failed", err);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [overrides, isHydrated]);

  const candidates = useMemo<Candidate[]>(() => {
    if (Object.keys(overrides).length === 0) return data.candidates;
    return data.candidates.map((c) => {
      const o = overrides[c.id];
      if (!o) return c;
      return { ...c, ...o };
    });
  }, [data.candidates, overrides]);

  const setOverride = useCallback(
    (candidateId: string, fieldKey: string, value: string) => {
      dirty.current = true;
      setOverrides((prev) => {
        const next = { ...prev };
        const current = { ...(next[candidateId] || {}) };
        current[fieldKey] = value;
        next[candidateId] = current;
        return next;
      });
    },
    [],
  );

  const clearOverride = useCallback(
    (candidateId: string, fieldKey: string) => {
      dirty.current = true;
      setOverrides((prev) => {
        const cur = prev[candidateId];
        if (!cur || !(fieldKey in cur)) return prev;
        const next = { ...prev };
        const candidateOverrides = { ...cur };
        delete candidateOverrides[fieldKey];
        if (Object.keys(candidateOverrides).length === 0) {
          delete next[candidateId];
        } else {
          next[candidateId] = candidateOverrides;
        }
        return next;
      });
    },
    [],
  );

  return {
    candidates,
    overrides,
    setOverride,
    clearOverride,
    isHydrated,
  };
}
