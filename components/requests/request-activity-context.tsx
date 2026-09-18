"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface RequestActivityState {
  /**
   * Whether any operation is currently running on this request, started
   * from anywhere. Every control in the workspace disables on this.
   */
  running: boolean;
  /**
   * The operation types running right now (`article_generation`,
   * `source_analysis`, …), so a control can show its own spinner and say
   * what is happening rather than only greying out.
   */
  runningOperations: string[];
}

const RequestActivityContext = createContext<RequestActivityState>({
  running: false,
  runningOperations: [],
});

/**
 * How long a `running` operation row is believed before it is treated as
 * wreckage.
 *
 * A server that dies mid-operation leaves its row saying `running` for
 * ever, and a UI that trusts that row without question is a UI that can
 * be locked permanently by one crash. The longest legitimate operation is
 * a few minutes, so anything past this is not slow, it is gone.
 */
const STALE_RUN_MS = 10 * 60 * 1000;
const POLL_MS = 2500;

/**
 * Whether anything is currently working on this request.
 *
 * This was client state alone, which meant it was per-tab: switching to
 * another workspace tab and back, or opening the request in a second
 * browser tab, showed idle buttons over a running operation — and an idle
 * button gets pressed. The server's idempotency guards did stop the
 * duplicate work, but silently, so the interface was telling one story
 * and the database another.
 *
 * So the truth now comes from where the work actually is: `operation_runs`
 * has a row per operation with a status, written before the work starts
 * and updated when it ends. Polling it means any tab, freshly opened or
 * long since abandoned, sees the same thing — and it survives a reload,
 * which client state never could.
 *
 */
export function RequestActivityProvider({ requestId, children }: { requestId: string; children: ReactNode }) {
  const [runningOperations, setRunningOperations] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    async function poll() {
      const { data } = await supabase
        .from("operation_runs")
        .select("operation_type, started_at, created_at")
        .eq("request_id", requestId)
        .in("status", ["queued", "running"]);
      if (cancelled) return;
      const cutoff = Date.now() - STALE_RUN_MS;
      setRunningOperations(
        (data ?? [])
          .filter((row) => new Date(row.started_at ?? row.created_at).getTime() > cutoff)
          .map((row) => row.operation_type)
      );
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [requestId]);

  const value = useMemo(
    () => ({
      running: runningOperations.length > 0,
      runningOperations,
    }),
    [runningOperations]
  );

  return <RequestActivityContext.Provider value={value}>{children}</RequestActivityContext.Provider>;
}

export function useRequestActivity(): RequestActivityState {
  return useContext(RequestActivityContext);
}

/**
 * Whether one named operation is running, for a control that should show
 * its own progress rather than merely standing down for someone else's.
 */
export function useOperationRunning(...operationTypes: string[]): boolean {
  const { runningOperations } = useRequestActivity();
  return operationTypes.some((type) => runningOperations.includes(type));
}
