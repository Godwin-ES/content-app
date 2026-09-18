"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { startResearchAction } from "@/actions/research";
import { setSuppliedSourcesOnlyAction, setPrimaryKeywordAction } from "@/actions/requests";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/shared/empty-state";
import { EditableSetting } from "@/components/shared/editable-setting";
import { TriangleAlert } from "lucide-react";
import type { KeywordCoverage } from "@/lib/research/keyword-coverage";
import { SourceReviewWorkspace } from "@/components/research/source-review-workspace";
import { SourceCard } from "@/components/research/source-card";
import { ResearchProgress, type ResearchProgressSignals } from "@/components/research/research-progress";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
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
  primaryKeyword: string | null;
  canEditSettings: boolean;
  keywordCoverage: KeywordCoverage | null;
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
  primaryKeyword,
  canEditSettings,
  keywordCoverage,
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

  const locked = busyCount > 0;
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
    }
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
      {/* The keyword lives here because this is where its consequences are:
          it steers the search queries, the content plan, and the SEO
          checks. Left blank at intake it is derived from the research plan,
          and before this there was no way to correct that derivation short
          of starting the request over. */}
      <EditableSetting
        label="Primary keyword"
        description="The term the article should rank for. Research, the content plan and the SEO checks all work from it."
        value={primaryKeyword}
        derivedLabel="Not set — it will be derived from the research plan"
        placeholder="e.g. AI recruiting agents"
        onSave={(next) => setPrimaryKeywordAction(requestId, next)}
        disabled={locked || !canEditSettings}
      />

      {/* Only shown when there is a gap. A green "coverage is fine" banner
          would be one more thing to read on every visit and would say
          nothing the sources do not already. */}
      {keywordCoverage?.assessed && !keywordCoverage.covered ? (
        <Alert variant={keywordCoverage.blocking ? "destructive" : "default"}>
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>{keywordCoverage.message}</AlertDescription>
        </Alert>
      ) : null}

      {status === "draft" ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Research</h3>
          {isStarting ? (
            <ResearchProgress signals={progressSignals} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Research runs over the materials and URLs supplied with this request, plus a general web search of the topic.
            </p>
          )}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {hasSuppliedSources ? (
            <label className="flex w-fit items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={suppliedOnly}
                disabled={locked || isSavingScope}
                onChange={(e) => updateScope(e.target.checked)}
              />
              Only use the supplied materials and URLs — skip general web research
            </label>
          ) : null}

          <Button type="button" onClick={startResearch} disabled={locked} className="w-fit">
            {isStarting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Researching...
              </>
            ) : (
              "Start research"
            )}
          </Button>
        </div>
      ) : null}

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
            />
          ))}
        </div>
      )}
    </div>
  );
}
