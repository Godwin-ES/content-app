"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { startResearchAction } from "@/actions/research";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/shared/empty-state";
import { SupportingMaterialUpload } from "@/components/requests/supporting-material-upload";
import { AddUrlControl } from "@/components/research/add-url-control";
import { SourceReviewWorkspace } from "@/components/research/source-review-workspace";
import { SourceCard } from "@/components/research/source-card";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Database } from "@/lib/supabase/database.types";

type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];
type SourceEvidenceRow = Database["public"]["Tables"]["source_evidence"]["Row"];
type SourceConflictRow = Database["public"]["Tables"]["source_conflicts"]["Row"];
type SupportingMaterialRow = Database["public"]["Tables"]["supporting_materials"]["Row"];

interface ResearchTabProps {
  requestId: string;
  status: string;
  sources: ResearchSourceRow[];
  evidenceBySource: Record<string, SourceEvidenceRow[]>;
  decisionsBySource: Record<string, "accepted" | "excluded" | null>;
  conflicts: SourceConflictRow[];
  materials: SupportingMaterialRow[];
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
export function ResearchTab({ requestId, status, sources, evidenceBySource, decisionsBySource, conflicts, materials }: ResearchTabProps) {
  const [busyCount, setBusyCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, startTransition] = useTransition();
  const router = useRouter();

  const handleBusyChange = useCallback((busy: boolean) => {
    setBusyCount((count) => Math.max(0, count + (busy ? 1 : -1)));
  }, []);

  const locked = busyCount > 0;

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
  const [liveSourceStats, setLiveSourceStats] = useState<{ total: number; processed: number } | null>(null);

  useEffect(() => {
    if (!isStarting) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    async function poll() {
      const { data } = await supabase.from("research_sources").select("retrieval_status").eq("request_id", requestId);
      if (cancelled || !data) return;
      setLiveSourceStats({ total: data.length, processed: data.filter((s) => s.retrieval_status !== "pending").length });
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      setLiveSourceStats(null);
    };
  }, [isStarting, requestId]);

  const sourceStats = liveSourceStats ?? { total: sources.length, processed: sources.filter((s) => s.retrieval_status !== "pending").length };

  return (
    <div className="flex flex-col gap-6">
      {status === "draft" ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Research</h3>
          {isStarting ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {sourceStats.total === 0
                ? "Discovering candidate sources..."
                : `Retrieving and analyzing sources: ${sourceStats.processed} of ${sourceStats.total} processed so far.`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Start research on this topic using any supplied URLs/materials below, plus a general web search.
            </p>
          )}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
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

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="text-sm font-medium">Provide any additional supporting materials or source URLs</h3>
        <div className="flex flex-wrap gap-2">
          <SupportingMaterialUpload requestId={requestId} initialMaterials={materials} locked={locked} onBusyChange={handleBusyChange} />
          <AddUrlControl requestId={requestId} locked={locked} onBusyChange={handleBusyChange} />
        </div>
      </div>

      {sources.length === 0 ? (
        <EmptyState title="No sources yet" description="Add supporting material or source URLs to begin research." />
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
