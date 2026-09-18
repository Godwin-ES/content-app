"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { startResearchAction } from "@/actions/research";
import { setSuppliedSourcesOnlyAction } from "@/actions/requests";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/shared/empty-state";
import type { ResearchRunAvailability } from "@/lib/research/service";
import { SourceReviewWorkspace } from "@/components/research/source-review-workspace";
import { SourceCard } from "@/components/research/source-card";
import { AddSources } from "@/components/research/add-sources";
import { ResearchProgress, type ResearchProgressSignals } from "@/components/research/research-progress";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAutoMode } from "@/components/requests/auto-mode-context";
import type { Database } from "@/lib/supabase/database.types";

type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];
type SourceEvidenceRow = Database["public"]["Tables"]["source_evidence"]["Row"];
type SourceConflictRow = Database["public"]["Tables"]["source_conflicts"]["Row"];

interface ResearchTabProps {
  requestId: string;
  status: string;
  sources: ResearchSourceRow[];
  evidenceBySource: Record<string, SourceEvidenceRow[]>;
  decisionsBySource: Record<string, "accepted" | "excluded" | null>;
  conflicts: SourceConflictRow[];
  suppliedSourcesOnly: boolean;
  /** What the last run's scope was — null before any run has happened. */
  researchedSuppliedOnly: boolean | null;
  runAvailability: ResearchRunAvailability;
}

/**
 * The whole Research tab as one client component (Phase 2 of the
 * post-Task-22 UX pass), so every control that can trigger a research/AI
 * operation — the main "Start research" button, adding a URL, uploading a
 * file, and every source's own Start Research/Retry — shares one lock.
 * While any one of them is running, every other one greys out, the same
 * "don't let two things mutate shared state at once" pattern week-3's
 * proposal workspace already uses for section edit/regenerate.
 */
export function ResearchTab({
  requestId,
  status,
  sources,
  evidenceBySource,
  decisionsBySource,
  conflicts,
  suppliedSourcesOnly,
  researchedSuppliedOnly,
  runAvailability,
}: ResearchTabProps) {
  const [busyCount, setBusyCount] = useState(0);
  const [suppliedOnly, setSuppliedOnly] = useState(suppliedSourcesOnly);
  const [isSavingScope, setIsSavingScope] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, startTransition] = useTransition();
  const router = useRouter();

  const handleBusyChange = useCallback((busy: boolean) => {
    setBusyCount((count) => Math.max(0, count + (busy ? 1 : -1)));
  }, []);

  // Auto mode drives the same pipeline from the Overview. While it is
  // stepping, every control here is one that would collide with it.
  const { running: autoModeRunning } = useAutoMode();
  const locked = busyCount > 0 || autoModeRunning;
  /**
   * A web search has already run, so the scope no longer decides anything.
   *
   * The searches are done and will not be repeated — re-running only ever
   * reads sources you have added since. Leaving the box live would suggest
   * ticking it could take those results back, or that unticking it could
   * buy another search; neither is true.
   */
  const webSearchDone = researchedSuppliedOnly === false;
  const canChangeScope = (status === "draft" || status === "source_review") && !webSearchDone;

  /**
   * A researched source is out of scope while "supplied only" is ticked:
   * it stays on screen as history, but it is not what the plan would be
   * built from, and showing it at full strength beside the ones that are
   * invites deciding on something that does not count.
   */
  const outOfScope = (source: ResearchSourceRow) => suppliedOnly && source.origin === "researched";
  const hasSuppliedSources = sources.some((source) => source.origin !== "researched");

  async function updateScope(next: boolean) {
    setSuppliedOnly(next);
    setError(null);
    setIsSavingScope(true);
    const result = await setSuppliedSourcesOnlyAction(requestId, next);
    setIsSavingScope(false);
    if (!result.ok) {
      setSuppliedOnly(!next);
      setError(result.error.message);
      return;
    }
    // Whether research can run again is decided on the server from this
    // very flag, so the button and its hint are stale until the page
    // re-renders. Without this, unticking made the out-of-scope sources
    // reappear while the button still said "allow a web search".
    router.refresh();
  }

  function startResearch() {
    setError(null);
    handleBusyChange(true);
    startTransition(async () => {
      const result = await startResearchAction(requestId);
      handleBusyChange(false);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  // The research pipeline retrieves and analyzes each source one at a time
  // server-side (lib/research/service.ts), writing its status as it goes
  // rather than all at once at the end — so polling for fresh counts while
  // it runs can show genuine per-source progress instead of a static "in
  // progress" placeholder for what can be a multi-minute run. This polls
  // the database directly through the browser client rather than calling
  // router.refresh(): the Next.js App Router only processes one pending
  // navigation/action at a time, so refresh calls issued while
  // startResearchAction's own request is still in flight get queued behind
  // it and never land until the whole pipeline finishes — which would
  // defeat the purpose of live progress entirely.
  const [liveSignals, setLiveSignals] = useState<ResearchProgressSignals | null>(null);

  useEffect(() => {
    if (!isStarting) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    async function poll() {
      const [sourceRows, events] = await Promise.all([
        supabase.from("research_sources").select("retrieval_status").eq("request_id", requestId),
        supabase.from("activity_events").select("event_type").eq("request_id", requestId),
      ]);
      if (cancelled || !sourceRows.data) return;
      const eventTypes = new Set((events.data ?? []).map((e) => e.event_type));
      setLiveSignals({
        planCreated: eventTypes.has("research_plan_created"),
        totalSources: sourceRows.data.length,
        processedSources: sourceRows.data.filter((s) => s.retrieval_status !== "pending").length,
        retrievalCompleted: eventTypes.has("research_retrieval_completed"),
      });
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      setLiveSignals(null);
    };
  }, [isStarting, requestId]);

  const progressSignals: ResearchProgressSignals = liveSignals ?? {
    planCreated: false,
    totalSources: sources.length,
    processedSources: sources.filter((s) => s.retrieval_status !== "pending").length,
    retrievalCompleted: false,
  };

  return (
    <div className="flex flex-col gap-6">


      {/* Always present once the request exists, even when research has
          already run. Hiding the button when it is unavailable leaves
          someone wondering whether searching again is possible at all;
          showing it greyed out, with the reason beside it, answers that
          without their having to ask. A re-run is additive — everything
          already retrieved keeps whatever decision has been made about it. */}
      {
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <h3 className="text-sm font-medium">{runAvailability.canRun ? runAvailability.label : "Research"}</h3>
          {isStarting ? (
            <ResearchProgress signals={progressSignals} />
          ) : (
            (runAvailability.canRun ? runAvailability.detail : runAvailability.reason) ? (
              <p className="text-sm text-muted-foreground">
                {runAvailability.canRun ? runAvailability.detail : runAvailability.reason}
              </p>
            ) : null
          )}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {/* Changeable until the source set is confirmed, not only while
              the request is a draft. Supplied-only research that finds
              nothing relevant is the most likely dead end there is, and
              unticking this is the way out of it. */}
          {hasSuppliedSources && canChangeScope ? (
            <label className="flex w-fit items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={suppliedOnly}
                disabled={locked || isSavingScope}
                onChange={(e) => updateScope(e.target.checked)}
              />
              <span>
                Only use the supplied materials and URLs — skip general web research
                {suppliedOnly && status === "source_review" ? (
                  <span className="block text-muted-foreground">Untick to let research look beyond them, once.</span>
                ) : null}
              </span>
            </label>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={startResearch} disabled={locked || !runAvailability.canRun} className="w-fit">
              {isStarting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Researching...
                </>
              ) : (
                (runAvailability.canRun && runAvailability.label) || "Start research"
              )}
            </Button>
            {runAvailability.hint && !isStarting ? (
              <span className="text-sm text-muted-foreground">{runAvailability.hint}</span>
            ) : null}
          </div>
        </div>
      }

      {canChangeScope ? <AddSources requestId={requestId} disabled={locked} /> : null}

      {sources.length === 0 ? (
        <EmptyState title="No sources yet" description="Start research to gather sources for this topic." />
      ) : status === "source_review" ? (
        <SourceReviewWorkspace
          requestId={requestId}
          sources={sources}
          evidenceBySource={evidenceBySource}
          decisionsBySource={decisionsBySource}
          conflicts={conflicts}
          locked={locked}
          onBusyChange={handleBusyChange}
          isOutOfScope={outOfScope}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-medium">Sources</h3>
          {sources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              evidence={evidenceBySource[source.id] ?? []}
              decision={decisionsBySource[source.id] ?? null}
              hasConflict={false}
              showDecisionControls={false}
              locked={locked}
              onBusyChange={handleBusyChange}
              outOfScope={outOfScope(source)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
