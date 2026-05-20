"use client";

import { useMemo } from "react";
import type { Candidate, ProcessedData } from "@/lib/types";
import type { GroupsBundle } from "@/lib/groups-types";
import { useGroups } from "@/lib/use-groups";
import { GroupCard } from "./GroupCard";
import { UnassignedPool } from "./UnassignedPool";
import { ValidationBar } from "./ValidationBar";

interface GroupsProps {
  data: ProcessedData;
}

function exportCsv(bundle: GroupsBundle, candidatesById: Map<string, Candidate>) {
  const tc = bundle.config.technicalConstraint;
  const rows: string[][] = [
    ["group_number", "problem", "member_name", "member_email", "member_role", "member_technicality"],
  ];
  for (const g of bundle.state.groups) {
    for (const id of g.memberIds) {
      const c = candidatesById.get(id);
      if (!c) continue;
      const role = String(c["role"] ?? c["roleRaw"] ?? "");
      rows.push([
        String(g.number),
        g.problem ?? "",
        c.name,
        c.email,
        role,
        String(c[tc.dimensionKey] ?? ""),
      ]);
    }
  }
  const csv = rows
    .map((r) =>
      r.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "groups.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function Groups({ data }: GroupsProps) {
  const { load, moveMember, swapMembers, toggleLock, setProblem, reseed } =
    useGroups();

  const candidatesById = useMemo(
    () => new Map(data.candidates.map((c) => [c.id, c])),
    [data.candidates],
  );

  if (load.status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Loading…</p>
      </div>
    );
  }

  if (load.status === "disabled") {
    return (
      <div className="bg-white rounded-xl border border-stone-100 p-8 text-center">
        <h2 className="text-lg font-semibold text-stone-700">
          Groups module not enabled
        </h2>
        <p className="text-stone-500 mt-2 text-sm">
          Run the <code className="bg-stone-100 px-1.5 py-0.5 rounded text-xs">/groups-setup</code> slash command in Claude
          to enable team organization for this event.
        </p>
      </div>
    );
  }

  const { bundle } = load;
  const { config, state } = bundle;

  const violationsByGroup = new Map<string, typeof state.validation>();
  for (const v of state.validation) {
    if (!violationsByGroup.has(v.groupId)) violationsByGroup.set(v.groupId, []);
    violationsByGroup.get(v.groupId)!.push(v);
  }

  const externalMembersByCluster = new Map<string, string[]>();
  for (const c of bundle.seeds.clusters) {
    if (c.externalMembers && c.externalMembers.length > 0) {
      externalMembersByCluster.set(c.id, c.externalMembers);
    }
  }

  // Pick first available group for unassigned-chip click action
  const firstGroupId = state.groups[0]?.id;

  // Layout: if problems configured, columns. Otherwise single column.
  const hasProblems = config.problems.length > 0;
  const groupsByProblem = new Map<string | null, typeof state.groups>();
  for (const g of state.groups) {
    const key = g.problem;
    if (!groupsByProblem.has(key)) groupsByProblem.set(key, []);
    groupsByProblem.get(key)!.push(g);
  }

  const columns = hasProblems
    ? [
        ...config.problems.map((p) => ({
          key: p.key,
          label: p.label,
          groups: groupsByProblem.get(p.key) ?? [],
        })),
        ...(groupsByProblem.has(null)
          ? [{ key: "__none__", label: "No problem assigned", groups: groupsByProblem.get(null)! }]
          : []),
      ]
    : [{ key: "all", label: "Groups", groups: state.groups }];

  return (
    <div className="space-y-4">
      <ValidationBar
        validation={state.validation}
        onReseed={reseed}
        onExport={() => exportCsv(bundle, candidatesById)}
      />

      <UnassignedPool
        candidateIds={state.unassigned}
        candidatesById={candidatesById}
        techConstraint={config.technicalConstraint}
        secondaryDot={config.secondaryDot}
        onDrop={(id) => moveMember(id, "unassigned")}
        onMoveToGroup={(id) => firstGroupId && moveMember(id, firstGroupId)}
      />

      <div
        className={`grid gap-4 ${hasProblems ? "md:grid-cols-2" : "grid-cols-1"}`}
      >
        {columns.map((col) => (
          <div key={col.key} className="space-y-3">
            {hasProblems && (
              <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
                {col.label} <span className="text-stone-400 font-normal">({col.groups.length})</span>
              </h3>
            )}
            {col.groups.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-stone-200 p-6 text-center text-xs text-stone-400">
                No groups in this track yet.
              </div>
            ) : (
              col.groups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  allGroups={state.groups}
                  candidatesById={candidatesById}
                  config={config}
                  violations={violationsByGroup.get(g.id) ?? []}
                  externalMembers={
                    g.seedClusterId
                      ? externalMembersByCluster.get(g.seedClusterId)
                      : undefined
                  }
                  onDropMember={(id, toId) => moveMember(id, toId)}
                  onMove={(id, to) => moveMember(id, to)}
                  onSwap={swapMembers}
                  onToggleLock={() => toggleLock(g.id)}
                  onSetProblem={(p) => setProblem(g.id, p)}
                />
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
