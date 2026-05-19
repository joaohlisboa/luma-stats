import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Candidate, ProcessedData } from "./types";

type Decision = "approved" | "declined";
type Decisions = Record<string, Decision>;

const API = "/api/triage";
const LEGACY_PREFIX = "triage-";
const DEBOUNCE_MS = 300;

/**
 * Merge all legacy `triage-{hash}` localStorage entries. Used once on first
 * load when the server file is empty, to migrate existing in-browser decisions.
 */
function readLegacyLocalStorage(): Decisions | null {
  try {
    const merged: Decisions = {};
    let found = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LEGACY_PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Decisions;
      Object.assign(merged, parsed);
      found = true;
    }
    return found ? merged : null;
  } catch {
    return null;
  }
}

export function useTriage(data: ProcessedData) {
  const [decisions, setDecisions] = useState<Decisions>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API);
        const server = res.ok ? ((await res.json()) as Decisions) : {};

        if (Object.keys(server).length === 0) {
          const legacy = readLegacyLocalStorage();
          if (legacy && Object.keys(legacy).length > 0) {
            await fetch(API, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(legacy),
            });
            if (!cancelled) {
              setDecisions(legacy);
              console.info(
                `[triage] migrated ${Object.keys(legacy).length} decisions from localStorage to data/triage.json`,
              );
            }
          }
        } else if (!cancelled) {
          setDecisions(server);
        }
      } catch (err) {
        console.warn("[triage] failed to load from server", err);
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || !dirty.current) return;
    const t = setTimeout(() => {
      fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decisions),
      }).catch((err) => {
        console.warn("[triage] save failed", err);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [decisions, isHydrated]);

  const getDecision = useCallback(
    (c: Candidate): string => decisions[c.id] || c.approvalStatus,
    [decisions],
  );

  const setDecision = useCallback((id: string, d: Decision) => {
    dirty.current = true;
    setDecisions((prev) => ({ ...prev, [id]: d }));
  }, []);

  const clearDecision = useCallback((id: string) => {
    dirty.current = true;
    setDecisions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const bulkApprove = useCallback((ids: string[]) => {
    dirty.current = true;
    setDecisions((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = "approved";
      return next;
    });
  }, []);

  const bulkDecline = useCallback((ids: string[]) => {
    dirty.current = true;
    setDecisions((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = "declined";
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    dirty.current = true;
    setDecisions({});
  }, []);

  const counts = useMemo(() => {
    let approved = 0,
      pending = 0,
      declined = 0;
    for (const c of data.candidates) {
      const d = getDecision(c);
      if (d === "approved") approved++;
      else if (d === "declined") declined++;
      else pending++;
    }
    return { approved, pending, declined, total: data.candidates.length };
  }, [data.candidates, getDecision]);

  return {
    decisions,
    isHydrated,
    getDecision,
    setDecision,
    clearDecision,
    bulkApprove,
    bulkDecline,
    resetAll,
    counts,
  };
}
