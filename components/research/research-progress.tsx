"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ResearchProgressSignals {
  planCreated: boolean;
  totalSources: number;
  processedSources: number;
  retrievalCompleted: boolean;
}

type StageState = "waiting" | "active" | "done";

/**
 * Stage-by-stage progress for a research run that can take several
 * minutes, driven entirely by signals polled from the database rather than
 * a timer — every tick shown here corresponds to something the pipeline
 * actually wrote.
 *
 * The stages deliberately match what lib/research/service.ts really does.
 * Retrieval and evidence analysis are not two sequential phases: each
 * source is retrieved and analyzed together (retrieveAndAnalyze), several
 * at a time, so they are shown as one stage with a real per-source count
 * instead of two bars that would have to advance in lockstep to be honest.
 */
function retrievalLabelSuffix(total: number, processed: number, completed: boolean): string {
  if (total === 0) return "";
  if (completed) return ` — ${total} analyzed`;
  // A fraction is only meaningful while something is genuinely outstanding,
  // which happens for supplied URLs and files: those exist as pending rows
  // from the start. Otherwise report the running total instead of a
  // permanent "n of n".
  return processed < total ? ` — ${processed} of ${total}` : ` — ${processed} so far`;
}

export function ResearchProgress({ signals }: { signals: ResearchProgressSignals }) {
  const { planCreated, totalSources, processedSources, retrievalCompleted } = signals;

  const stages: Array<{ label: string; state: StageState }> = [
    {
      label: "Research plan created",
      state: planCreated ? "done" : "active",
    },
    {
      label: "Discovering candidate sources",
      state: !planCreated ? "waiting" : totalSources > 0 ? "done" : "active",
    },
    {
      label: `Retrieving and analyzing sources${retrievalLabelSuffix(totalSources, processedSources, retrievalCompleted)}`,
      // Completion is taken from the pipeline's own
      // research_retrieval_completed event, never inferred from the counts:
      // a source discovered by web search only gets its row once it has
      // already been retrieved, so processed == total for most of the run
      // and would mark this done almost immediately.
      state: retrievalCompleted ? "done" : totalSources === 0 ? "waiting" : "active",
    },
    {
      label: "Preparing source review",
      state: retrievalCompleted ? "active" : "waiting",
    },
  ];

  return (
    <ol className="flex flex-col gap-2">
      {stages.map((stage) => (
        <li
          key={stage.label}
          className={cn("flex items-center gap-2 text-sm", stage.state === "waiting" ? "text-muted-foreground/60" : "text-muted-foreground")}
        >
          {stage.state === "done" ? (
            <Check aria-hidden className="size-4 shrink-0 text-foreground" />
          ) : stage.state === "active" ? (
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
          ) : (
            <span aria-hidden className="size-4 shrink-0 rounded-full border border-current opacity-40" />
          )}
          <span className={cn(stage.state === "done" && "text-foreground")}>{stage.label}</span>
        </li>
      ))}
    </ol>
  );
}
