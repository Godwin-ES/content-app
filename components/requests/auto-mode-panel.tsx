"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, OctagonAlert, Sparkles, Square } from "lucide-react";
import { runAutoStepAction } from "@/actions/auto-mode";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AUTO_MODE_STAGES, PIPELINE_STAGES, type PipelineStage } from "@/lib/workspace/next-action";
import { useAutoMode } from "@/components/requests/auto-mode-context";
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
export function AutoModePanel({
  requestId,
  canRun,
  currentStage,
}: {
  requestId: string;
  canRun: boolean;
  /** Where the request has already got to, so finished stages are not offered. */
  currentStage: PipelineStage;
}) {
  /**
   * Stages still ahead of this request.
   *
   * A stage it has already passed is not a stopping point, it is history —
   * offering "run through Research" on a request whose sources are
   * confirmed invites someone to ask for something that cannot happen.
   * Research reappears on its own if the keyword is edited, because that
   * puts the request back at the Research stage.
   */
  const remainingStages = AUTO_MODE_STAGES.filter(
    (stage) => PIPELINE_STAGES.indexOf(stage) >= PIPELINE_STAGES.indexOf(currentStage)
  );

  const [stopAfter, setStopAfter] = useState<PipelineStage>(remainingStages.at(-1) ?? "Package");
  const [log, setLog] = useState<LogEntry[]>([]);
  const { running, setRunning } = useAutoMode();
  const [error, setError] = useState<string | null>(null);
  /**
   * What the running loop actually sends, so pressing Stop takes effect on
   * the very next step rather than after a re-render.
   */
  const stopAfterRef = useRef<PipelineStage>(stopAfter);
  const [stopRequested, setStopRequested] = useState(false);
  const router = useRouter();

  function chooseStopAfter(stage: PipelineStage) {
    setStopAfter(stage);
    stopAfterRef.current = stage;
  }

  /**
   * Stop finishes the stage, not the step.
   *
   * Stopping mid-stage leaves the request somewhere no one asked for —
   * sources retrieved but never reviewed, articles generated but none
   * selected. Asking the server to stop after the stage in flight reuses
   * the same rule the dropdown uses, so "stop" and "run through" cannot
   * disagree about where a stage ends.
   */
  function requestStop(stageInFlight: PipelineStage) {
    stopAfterRef.current = stageInFlight;
    setStopAfter(stageInFlight);
    setStopRequested(true);
  }

  async function run() {
    setRunning(true);
    setStopRequested(false);
    setError(null);
    setLog([]);

    // try/finally because `running` greys out every other control in the
    // workspace. An action that throws rather than returning an error — a
    // dropped connection mid-step — would otherwise leave the whole
    // request locked with no way back but a reload.
    try {
      // A guard against a state machine that somehow never settles; a real
      // run is a dozen steps at most.
      for (let step = 0; step < 40; step++) {
        const result = await runAutoStepAction(requestId, stopAfterRef.current);

        if (!result.ok) {
          setError(result.error.message);
          break;
        }

        setLog((prev) => [...prev, { status: result.data.status, message: result.data.message }]);
        if (result.data.status !== "advanced") break;
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Auto mode stopped unexpectedly.");
    } finally {
      setRunning(false);
      setStopRequested(false);
      router.refresh();
    }
  }

  /** The stage the last completed step belonged to, for the Stop button. */
  const stageInFlight = stopAfterRef.current;

  // Nothing left for it to do — an approved request is past every stage
  // auto mode is allowed to touch, and an empty dropdown beside a dead Run
  // button says less than nothing.
  if (remainingStages.length === 0) return null;

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
            onChange={(e) => chooseStopAfter(e.target.value as PipelineStage)}
            disabled={running}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {remainingStages.map((stage) => (
              <option key={stage} value={stage}>
                {stage === "Package" ? "Package (furthest)" : stage}
              </option>
            ))}
          </select>

          {running ? (
            <Button type="button" size="sm" variant="outline" onClick={() => requestStop(stageInFlight)} disabled={stopRequested}>
              <Square className="size-4" />
              {stopRequested ? "Stopping after this stage" : "Stop after this stage"}
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
        review. It never approves or publishes. While it runs, the other tabs&apos; controls are disabled so nothing competes with
        it; Stop finishes the stage in flight rather than abandoning it half-done.
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
