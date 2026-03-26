import { useState, useEffect, useCallback, useMemo } from "react";
import type { Candidate, ProcessedData } from "./types";

type Decision = "approved" | "declined";

function storageKey(meta: ProcessedData["meta"]): string {
  // Simple hash from event name + date for scoping
  const raw = `${meta.eventName}|${meta.eventDate}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `triage-${Math.abs(hash).toString(36)}`;
}

export function useTriage(data: ProcessedData) {
  const key = storageKey(data.meta);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) setDecisions(JSON.parse(stored));
    } catch {
      // ignore
    }
    setIsHydrated(true);
  }, [key]);

  // Persist to localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(key, JSON.stringify(decisions));
    }
  }, [decisions, isHydrated, key]);

  const getDecision = useCallback(
    (c: Candidate): string => decisions[c.id] || c.approvalStatus,
    [decisions]
  );

  const setDecision = useCallback((id: string, d: Decision) => {
    setDecisions((prev) => ({ ...prev, [id]: d }));
  }, []);

  const clearDecision = useCallback((id: string) => {
    setDecisions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const bulkApprove = useCallback((ids: string[]) => {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = "approved";
      return next;
    });
  }, []);

  const bulkDecline = useCallback((ids: string[]) => {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = "declined";
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
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
