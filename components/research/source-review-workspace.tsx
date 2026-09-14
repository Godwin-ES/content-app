"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSourceSetAction } from "@/actions/sources";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SourceCard } from "@/components/research/source-card";
import { SourceConflictCard } from "@/components/research/source-conflict-card";
import { assignSourceLabels } from "@/lib/grounding/evidence";
import type { Database } from "@/lib/supabase/database.types";

type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];
type SourceEvidenceRow = Database["public"]["Tables"]["source_evidence"]["Row"];
type SourceConflictRow = Database["public"]["Tables"]["source_conflicts"]["Row"];

interface SourceReviewWorkspaceProps {
  requestId: string;
  sources: ResearchSourceRow[];
  evidenceBySource: Record<string, SourceEvidenceRow[]>;
  decisionsBySource: Record<string, "accepted" | "excluded" | null>;
  conflicts: SourceConflictRow[];
}

/**
 * Source Review workspace (SYSTEM-DESIGN-NEXTJS.md §10, §34.6). Confirming
 * requires at least one usable accepted source and no unresolved conflict;
 * the server RPC is the authoritative check, but the UI explains why the
 * button is disabled rather than just disabling it silently (§16, §23.1).
 */
export function SourceReviewWorkspace({
  requestId,
  sources,
  evidenceBySource,
  decisionsBySource,
  conflicts,
}: SourceReviewWorkspaceProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const labels = assignSourceLabels(sources.map((s) => s.id));
  const conflictedSourceIds = new Set(conflicts.filter((c) => !c.resolution).flatMap((c) => [c.source_a_id, c.source_b_id]));

  const acceptedUsableCount = sources.filter(
    (s) => s.retrieval_status === "usable" && decisionsBySource[s.id] === "accepted"
  ).length;
  const unresolvedConflicts = conflicts.filter((c) => !c.resolution);

  const readiness = [
    { key: "accepted", ok: acceptedUsableCount > 0, message: "At least one usable source must be accepted." },
    { key: "conflicts", ok: unresolvedConflicts.length === 0, message: "All source conflicts must be resolved." },
  ];
  const ready = readiness.every((r) => r.ok);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmSourceSetAction(requestId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Source Review</h2>

      {conflicts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {conflicts.map((conflict) => (
            <SourceConflictCard
              key={conflict.id}
              conflict={conflict}
              sourceALabel={labels.get(conflict.source_a_id) ?? "?"}
              sourceBLabel={labels.get(conflict.source_b_id) ?? "?"}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {sources.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            evidence={evidenceBySource[source.id] ?? []}
            decision={decisionsBySource[source.id] ?? null}
            hasConflict={conflictedSourceIds.has(source.id)}
          />
        ))}
      </div>

      {!ready ? (
        <ul className="list-inside list-disc text-sm text-muted-foreground">
          {readiness
            .filter((r) => !r.ok)
            .map((r) => (
              <li key={r.key}>{r.message}</li>
            ))}
        </ul>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" onClick={confirm} disabled={!ready || isPending} className="w-fit">
        {isPending ? "Confirming..." : "Confirm Source Set"}
      </Button>
    </div>
  );
}
