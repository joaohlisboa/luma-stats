import { useState, useEffect, useCallback, useMemo } from "react";
import type { Candidate, ProcessedData } from "./types";

type Overrides = Record<string, Record<string, string>>;

function storageKey(meta: ProcessedData["meta"]): string {
  const raw = `${meta.eventName}|${meta.eventDate}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `overrides-${Math.abs(hash).toString(36)}`;
}

export function useOverrides(data: ProcessedData) {
  const key = storageKey(data.meta);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) setOverrides(JSON.parse(stored));
    } catch {
      // ignore
    }
    setIsHydrated(true);
  }, [key]);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(key, JSON.stringify(overrides));
    }
  }, [overrides, isHydrated, key]);

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
      setOverrides((prev) => {
        const next = { ...prev };
        const current = { ...(next[candidateId] || {}) };
        current[fieldKey] = value;
        next[candidateId] = current;
        return next;
      });
    },
    []
  );

  const clearOverride = useCallback(
    (candidateId: string, fieldKey: string) => {
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
    []
  );

  return {
    candidates,
    overrides,
    setOverride,
    clearOverride,
    isHydrated,
  };
}
