"use client";

import { useState } from "react";
import type { Candidate } from "@/lib/types";
import type {
  Group,
  GroupsConfig,
  ValidationEntry,
} from "@/lib/groups-types";
import { MemberChip } from "./MemberChip";
import { SwapPopover } from "./SwapPopover";

interface GroupCardProps {
  group: Group;
  allGroups: Group[];
  candidatesById: Map<string, Candidate>;
  config: GroupsConfig;
  violations: ValidationEntry[];
  externalMembers?: string[];
  onDropMember: (candidateId: string, toGroupId: string) => void;
  onMove: (candidateId: string, toGroupId: string | "unassigned") => void;
  onSwap: (idA: string, idB: string) => void;
  onToggleLock: () => void;
  onSetProblem: (problem: string | null) => void;
}

function countTech(
  memberIds: string[],
  candidatesById: Map<string, Candidate>,
  config: GroupsConfig,
): { technical: number; nonTechnical: number } {
  const tc = config.technicalConstraint;
  let technical = 0;
  let nonTechnical = 0;
  for (const id of memberIds) {
    const c = candidatesById.get(id);
    if (!c) continue;
    const v = String(c[tc.dimensionKey] ?? "");
    if (tc.technicalValues.includes(v)) technical++;
    else nonTechnical++;
  }
  return { technical, nonTechnical };
}

function badgeClass(
  technical: number,
  config: GroupsConfig,
  hasHalt: boolean,
): string {
  if (hasHalt) return "bg-red-100 text-red-700";
  const tc = config.technicalConstraint;
  if (technical < tc.minTechnical || technical > tc.maxTechnical) {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-green-100 text-green-700";
}

export function GroupCard({
  group,
  allGroups,
  candidatesById,
  config,
  violations,
  externalMembers,
  onDropMember,
  onMove,
  onSwap,
  onToggleLock,
  onSetProblem,
}: GroupCardProps) {
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [showProblemPicker, setShowProblemPicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { technical, nonTechnical } = countTech(
    group.memberIds,
    candidatesById,
    config,
  );

  const hasHalt = violations.some((v) => v.severity === "halt");
  const hasWarn = violations.some((v) => v.severity === "warn");

  const borderColor = hasHalt
    ? "border-l-red-500"
    : hasWarn
      ? "border-l-amber-400"
      : "border-l-green-400";

  const slotCount = Math.max(config.targetSize, group.memberIds.length);
  const emptySlots = slotCount - group.memberIds.length;

  return (
    <div
      onDragOver={(e) => {
        if (group.locked) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        if (group.locked) return;
        const id = e.dataTransfer.getData("text/candidate-id");
        if (id) onDropMember(id, group.id);
      }}
      className={`bg-white rounded-xl border border-stone-100 shadow-sm border-l-4 ${borderColor} ${dragOver ? "ring-2 ring-stone-300" : ""} ${group.locked ? "opacity-90" : ""}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-stone-50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-stone-800">#{group.number}</span>
          {config.problems.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowProblemPicker(!showProblemPicker)}
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${group.problem ? "bg-stone-200 text-stone-700" : "bg-amber-100 text-amber-700"}`}
              >
                {group.problem || "no problem"}
              </button>
              {showProblemPicker && (
                <div className="absolute z-20 top-full mt-1 left-0 bg-white border border-stone-200 rounded-md shadow-md min-w-32">
                  {config.problems.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => {
                        onSetProblem(p.key);
                        setShowProblemPicker(false);
                      }}
                      className="block w-full text-left text-xs px-3 py-1.5 hover:bg-stone-50"
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      onSetProblem(null);
                      setShowProblemPicker(false);
                    }}
                    className="block w-full text-left text-xs px-3 py-1.5 text-stone-400 hover:bg-stone-50"
                  >
                    clear
                  </button>
                </div>
              )}
            </div>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeClass(technical, config, hasHalt)}`}>
            {technical}T / {nonTechnical}N
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggleLock}
            title={group.locked ? "Locked — won't be touched by Re-seed" : "Lock group"}
            className={`text-xs px-1.5 py-0.5 rounded ${group.locked ? "bg-stone-700 text-white" : "text-stone-400 hover:bg-stone-100"}`}
          >
            {group.locked ? "🔒" : "🔓"}
          </button>
        </div>
      </div>

      <div className="p-2 space-y-1">
        {group.memberIds.map((id) => {
          const member = candidatesById.get(id);
          if (!member) {
            return (
              <div key={id} className="text-[11px] text-stone-300 italic px-2">
                (missing candidate {id})
              </div>
            );
          }
          return (
            <div key={id} className="relative">
              <MemberChip
                candidate={member}
                techConstraint={config.technicalConstraint}
                secondaryDot={config.secondaryDot}
                onDragStart={() => {}}
                onClick={() => setOpenMemberId(openMemberId === id ? null : id)}
              />
              {openMemberId === id && (
                <SwapPopover
                  member={member}
                  groups={allGroups}
                  currentGroupId={group.id}
                  candidatesById={candidatesById}
                  onMove={(to) => onMove(id, to)}
                  onSwap={(other) => onSwap(id, other)}
                  onClose={() => setOpenMemberId(null)}
                />
              )}
            </div>
          );
        })}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="text-[10px] text-stone-300 italic border border-dashed border-stone-200 rounded-md px-2 py-1.5 text-center"
          >
            empty slot
          </div>
        ))}
      </div>

      {externalMembers && externalMembers.length > 0 && (
        <div className="px-3 py-1.5 border-t border-stone-50 text-[10px] text-stone-500">
          <span className="text-stone-400">Also includes:</span>{" "}
          {externalMembers.join(", ")}{" "}
          <span className="text-stone-400">(not registered)</span>
        </div>
      )}

      {violations.length > 0 && (
        <div className="px-3 py-1.5 border-t border-stone-50 space-y-0.5">
          {violations.map((v, i) => (
            <div
              key={i}
              className={`text-[10px] ${v.severity === "halt" ? "text-red-600" : v.severity === "warn" ? "text-amber-600" : "text-stone-400"}`}
            >
              {v.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
