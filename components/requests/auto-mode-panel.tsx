"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, OctagonAlert, Sparkles, Square } from "lucide-react";
import { runAutoStepAction } from "@/actions/auto-mode";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AUTO_MODE_STAGES, type PipelineStage } from "@/lib/workspace/next-action";
import { cn } from "@/lib/utils";

interface LogEntry {
  status: "advanced" | "finished" | "blocked";
  message: string;
}

/**
 * Runs the request forward on its own, one step at a time, until it reaches
 * the chosen stopping point or hits something only a person can decide.
 *
 * The loop lives here rather than on the server because a full run is
 * minutes long: stepping from the client keeps each request short, shows
 * every step as it completes instead of a single silent wait, and lets the
 * run be stopped between steps. Closing the page stops it too — nothing is
 * left half-finished, because each step is committed on its own.
 */
export function AutoModePanel({ requestId, canRun }: { requestId: string; canRun: boolean }) {
  const [stopAfter, setStopAfter] = useState<PipelineStage>("Approval");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const router = useRouter();

  async function run() {
    cancelled.current = false;
    setRunning(true);
    setError(null);
    setLog([]);

    // A guard against a state machine that somehow never settles; a real run
    // is a dozen steps at most.
    for (let step = 0; step < 40; step++) {
      if (cancelled.current) {
        setLog((prev) => [...prev, { status: "finished", message: "Stopped." }]);
        break;
      }

      const result = await runAutoStepAction(requestId, stopAfter);

      if (!result.ok) {
        setError(result.error.message);
        break;
      }

      setLog((prev) => [...prev, { status: result.data.status, message: result.data.message }]);
      if (result.data.status !== "advanced") break;
    }

    setRunning(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Auto mode</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="auto-stop-after" className="text-sm font-normal text-muted-foreground">
            Run through
          </Label>
          <select
            id="auto-stop-after"
            value={stopAfter}
            onChange={(e) => setStopAfter(e.target.value as PipelineStage)}
            disabled={running}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {AUTO_MODE_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage === "Approval" ? "Package (furthest)" : stage}
              </option>
            ))}
          </select>

          {running ? (
            <Button type="button" size="sm" variant="outline" onClick={() => (cancelled.current = true)}>
              <Square className="size-4" /> Stop after this step
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={run} disabled={!canRun}>
              Run
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Carries the request forward on its own — research, sources, plan, articles, channels — and stops at the package for you to
        review. It never submits for approval or publishes.
      </p>

      {log.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {log.map((entry, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {entry.status === "advanced" ? (
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground" />
              ) : entry.status === "blocked" ? (
                <OctagonAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
              ) : (
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={cn(entry.status === "blocked" ? "text-amber-900 dark:text-amber-200" : "text-muted-foreground")}>
                {entry.message}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {running ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Working on the next step…
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
