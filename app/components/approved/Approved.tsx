"use client";

import { useMemo } from "react";
import type { ProcessedData } from "@/lib/types";
import { useTriage } from "@/lib/use-triage";
import { CandidateTable } from "./CandidateTable";

interface ApprovedProps {
  data: ProcessedData;
  onSetOverride: (candidateId: string, fieldKey: string, value: string) => void;
}

export function Approved({ data, onSetOverride }: ApprovedProps) {
  const { isHydrated, getDecision } = useTriage(data);

  const approved = useMemo(
    () => data.candidates.filter((c) => getDecision(c) === "approved"),
    [data.candidates, getDecision]
  );

  if (!isHydrated) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-stone-700">
        Approved — {approved.length} candidates
      </h2>

      {approved.length === 0 ? (
        <div className="text-center py-12 text-stone-400">
          No approved candidates yet. Use the Triage view to start approving.
        </div>
      ) : (
        <CandidateTable
          candidates={approved}
          fields={data.schema.fields}
          triageDimensions={data.schema.triageDimensions}
          onSetOverride={onSetOverride}
        />
      )}
    </div>
  );
}
