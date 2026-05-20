"use client";

import { useState, useEffect, useMemo } from "react";
import type { ProcessedData } from "@/lib/types";
import { useOverrides } from "@/lib/use-overrides";
import { EmptyState } from "./components/EmptyState";
import { ViewToggle, type View } from "./components/ViewToggle";
import { Dashboard } from "./components/dashboard/Dashboard";
import { Triage } from "./components/triage/Triage";
import { Approved } from "./components/approved/Approved";
import { Groups } from "./components/groups/Groups";

function getHashView(): View {
  if (typeof window === "undefined") return "dashboard";
  const hash = window.location.hash.replace("#", "");
  if (hash === "triage" || hash === "approved" || hash === "groups") return hash;
  return "dashboard";
}

export default function StatsPage() {
  const [rawData, setRawData] = useState<ProcessedData | null | undefined>(undefined);
  const [view, setView] = useState<View>("dashboard");
  const [groupsEnabled, setGroupsEnabled] = useState(false);

  // Load data
  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const d = require("../data/processed.json") as ProcessedData;
      setRawData(d);
    } catch {
      setRawData(null);
    }
  }, []);

  // Detect whether the groups module is enabled (config + state present)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/groups")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setGroupsEnabled(data !== null);
      })
      .catch(() => {
        if (!cancelled) setGroupsEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply category overrides (persisted locally) to every consumer below.
  const fallback = useMemo<ProcessedData>(
    () => (rawData ?? { candidates: [], meta: { eventName: "", eventDate: "", processedAt: "", candidateCount: 0, lumaColumns: [], customColumns: [] }, schema: { dashboard: [], triageDimensions: [], fields: [], scoreFactors: [] } }) as ProcessedData,
    [rawData]
  );
  const { candidates: overriddenCandidates, setOverride } = useOverrides(fallback);
  const data = useMemo<ProcessedData | null | undefined>(() => {
    if (rawData === undefined) return undefined;
    if (rawData === null) return null;
    return { ...rawData, candidates: overriddenCandidates };
  }, [rawData, overriddenCandidates]);

  // Hash-based routing
  useEffect(() => {
    setView(getHashView());
    const onHash = () => setView(getHashView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const changeView = (v: View) => {
    window.location.hash = v;
    setView(v);
  };

  // Compute counts for the toggle
  const counts = useMemo(() => {
    if (!data) return { total: 0, approved: 0, pending: 0, declined: 0 };
    let approved = 0,
      pending = 0,
      declined = 0;
    for (const c of data.candidates) {
      const s = c.approvalStatus;
      if (s === "approved") approved++;
      else if (s === "declined") declined++;
      else pending++;
    }
    return { total: data.candidates.length, approved, pending, declined };
  }, [data]);

  // Loading state
  if (data === undefined) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  // No data
  if (!data) return <EmptyState />;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-100">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <p className="text-sm text-stone-400 uppercase tracking-wider font-medium">
            Luma Stats
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-stone-800 mt-1">
            {data.meta.eventName}
          </h1>
          {(data.meta.eventDate || data.meta.eventLocation) && (
            <p className="text-stone-500 mt-1 text-sm">
              {[data.meta.eventDate, data.meta.eventLocation]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <div className="mt-4">
            <ViewToggle
              active={view}
              onChangeView={changeView}
              counts={counts}
              groupsEnabled={groupsEnabled}
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {view === "dashboard" && <Dashboard data={data} />}
        {view === "triage" && <Triage data={data} />}
        {view === "approved" && <Approved data={data} onSetOverride={setOverride} />}
        {view === "groups" && <Groups data={data} />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-100 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center text-sm text-stone-400">
          Powered by Luma Stats
        </div>
      </footer>
    </div>
  );
}
