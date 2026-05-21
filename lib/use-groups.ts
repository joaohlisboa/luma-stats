import { useCallback, useEffect, useRef, useState } from "react";
import type { GroupsBundle, GroupsState } from "./groups-types";

const API = "/api/groups";
const DEBOUNCE_MS = 300;

export type GroupsLoadState =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "ready"; bundle: GroupsBundle };

export function useGroups() {
  const [load, setLoad] = useState<GroupsLoadState>({ status: "loading" });
  const dirty = useRef(false);
  const pending = useRef<GroupsState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(API);
        const data = (await res.json()) as GroupsBundle | null;
        if (cancelled) return;
        if (!data) {
          setLoad({ status: "disabled" });
          return;
        }
        setLoad({ status: "ready", bundle: data });
      } catch {
        if (!cancelled) setLoad({ status: "disabled" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced PUT when state changes
  useEffect(() => {
    if (load.status !== "ready" || !dirty.current) return;
    const t = setTimeout(async () => {
      if (!pending.current) return;
      try {
        const res = await fetch(API, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending.current),
        });
        if (res.ok) {
          const out = (await res.json()) as { ok: true; state: GroupsState };
          // Apply server-recomputed validation
          setLoad((prev) =>
            prev.status === "ready"
              ? { status: "ready", bundle: { ...prev.bundle, state: out.state } }
              : prev,
          );
        }
      } catch (err) {
        console.warn("[groups] save failed", err);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [load]);

  const mutate = useCallback((updater: (state: GroupsState) => GroupsState) => {
    setLoad((prev) => {
      if (prev.status !== "ready") return prev;
      const next = updater(prev.bundle.state);
      pending.current = next;
      dirty.current = true;
      return { status: "ready", bundle: { ...prev.bundle, state: next } };
    });
  }, []);

  const moveMember = useCallback(
    (candidateId: string, toGroupId: string | "unassigned") => {
      mutate((state) => {
        const groups = state.groups.map((g) => ({
          ...g,
          memberIds: g.memberIds.filter((id) => id !== candidateId),
        }));
        const unassigned = state.unassigned.filter((id) => id !== candidateId);
        if (toGroupId === "unassigned") {
          return { ...state, groups, unassigned: [...unassigned, candidateId] };
        }
        const target = groups.find((g) => g.id === toGroupId);
        if (target) target.memberIds.push(candidateId);
        return { ...state, groups, unassigned };
      });
    },
    [mutate],
  );

  const swapMembers = useCallback(
    (idA: string, idB: string) => {
      mutate((state) => {
        const findLoc = (id: string): { groupId: string | "unassigned" } => {
          for (const g of state.groups)
            if (g.memberIds.includes(id)) return { groupId: g.id };
          return { groupId: "unassigned" };
        };
        const a = findLoc(idA);
        const b = findLoc(idB);
        if (a.groupId === b.groupId) return state;
        const groups = state.groups.map((g) => {
          if (g.id === a.groupId)
            return { ...g, memberIds: g.memberIds.map((x) => (x === idA ? idB : x)) };
          if (g.id === b.groupId)
            return { ...g, memberIds: g.memberIds.map((x) => (x === idB ? idA : x)) };
          return g;
        });
        let unassigned = state.unassigned.slice();
        if (a.groupId === "unassigned")
          unassigned = unassigned.map((x) => (x === idA ? idB : x));
        if (b.groupId === "unassigned")
          unassigned = unassigned.map((x) => (x === idB ? idA : x));
        return { ...state, groups, unassigned };
      });
    },
    [mutate],
  );

  const toggleLock = useCallback(
    (groupId: string) => {
      mutate((state) => ({
        ...state,
        groups: state.groups.map((g) =>
          g.id === groupId ? { ...g, locked: !g.locked } : g,
        ),
      }));
    },
    [mutate],
  );

  const setProblem = useCallback(
    (groupId: string, problem: string | null) => {
      mutate((state) => ({
        ...state,
        groups: state.groups.map((g) =>
          g.id === groupId ? { ...g, problem } : g,
        ),
      }));
    },
    [mutate],
  );

  const addGroup = useCallback(
    (problem: string | null) => {
      mutate((state) => {
        const id = `group-${Math.random().toString(36).slice(2, 10)}`;
        const number =
          state.groups.reduce((max, g) => Math.max(max, g.number), 0) + 1;
        return {
          ...state,
          groups: [
            ...state.groups,
            {
              id,
              number,
              problem,
              memberIds: [],
              locked: false,
              seedClusterId: null,
            },
          ],
        };
      });
    },
    [mutate],
  );

  const reseed = useCallback(async () => {
    if (load.status !== "ready") return;
    try {
      const res = await fetch(`${API}?action=reseed`, { method: "POST" });
      if (!res.ok) return;
      const out = (await res.json()) as { ok: true; state: GroupsState };
      setLoad((prev) =>
        prev.status === "ready"
          ? { status: "ready", bundle: { ...prev.bundle, state: out.state } }
          : prev,
      );
    } catch (err) {
      console.warn("[groups] reseed failed", err);
    }
  }, [load]);

  return { load, moveMember, swapMembers, toggleLock, setProblem, addGroup, reseed };
}
