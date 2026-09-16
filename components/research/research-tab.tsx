"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startResearchAction } from "@/actions/research";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/shared/empty-state";
import { SupportingMaterialUpload } from "@/components/requests/supporting-material-upload";
import { AddUrlControl } from "@/components/research/add-url-control";
import { SourceReviewWorkspace } from "@/components/research/source-review-workspace";
import { SourceCard } from "@/components/research/source-card";
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

  return (
    <div className="flex flex-col gap-6">
      {status === "draft" ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <h3 className="text-sm font-medium">Research</h3>
          {isStarting ? (
            <ol className="flex flex-col gap-1 text-sm text-muted-foreground">
              <li>Research plan created</li>
              <li>Discovering candidate sources...</li>
              <li>Retrieving source content...</li>
              <li>Analyzing evidence...</li>
            </ol>
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
            {isStarting ? "Researching..." : "Start research"}
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
