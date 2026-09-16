"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordSourceDecisionAction } from "@/actions/sources";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SourceEvidenceDrawer } from "@/components/research/source-evidence-drawer";
import { LocalDateTime } from "@/components/shared/local-date-time";
import type { Database } from "@/lib/supabase/database.types";

type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];
type SourceEvidenceRow = Database["public"]["Tables"]["source_evidence"]["Row"];

const ORIGIN_LABEL: Record<ResearchSourceRow["origin"], string> = {
  researched: "Researched",
  user_url: "Your URL",
  uploaded_material: "Uploaded material",
};

interface SourceCardProps {
  source: ResearchSourceRow;
  evidence: SourceEvidenceRow[];
  decision: "accepted" | "excluded" | null;
  hasConflict: boolean;
}

/**
 * Source Review card (SYSTEM-DESIGN-NEXTJS.md §10.1). No numeric trust
 * score — the Content Manager inspects origin, freshness, and evidence
 * directly and makes an explicit accept/exclude call. A user-supplied
 * source starts with no decision, exactly like a researched one.
 */
export function SourceCard({ source, evidence, decision, hasConflict }: SourceCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isUsable = source.retrieval_status === "usable";
  const publishedYearsAgo = source.published_at
    ? new Date().getFullYear() - new Date(source.published_at).getFullYear()
    : null;

  function decide(next: "accepted" | "excluded") {
    setError(null);
    startTransition(async () => {
      const result = await recordSourceDecisionAction(source.id, next, null);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <a href={source.original_url ?? undefined} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
            {source.title ?? source.original_url}
          </a>
          <span className="truncate text-xs text-muted-foreground">
            {source.publisher ?? "Unknown publisher"} · {ORIGIN_LABEL[source.origin]}
            {source.published_at ? (
              <>
                {" · "}
                <LocalDateTime value={source.published_at} dateOnly />
              </>
            ) : null}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {decision ? <Badge variant={decision === "accepted" ? "default" : "secondary"}>{decision}</Badge> : null}
          {hasConflict ? <Badge variant="destructive">Conflict</Badge> : null}
          {publishedYearsAgo !== null && publishedYearsAgo >= 2 ? <Badge variant="outline">Freshness warning</Badge> : null}
        </div>
      </div>

      <SourceEvidenceDrawer evidence={evidence} />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={decision === "accepted" ? "default" : "outline"}
          disabled={!isUsable || isPending}
          onClick={() => decide("accepted")}
        >
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant={decision === "excluded" ? "default" : "outline"}
          disabled={isPending}
          onClick={() => decide("excluded")}
        >
          Exclude
        </Button>
      </div>
      {!isUsable ? <p className="text-xs text-muted-foreground">This source cannot be accepted until it retrieves successfully.</p> : null}
    </div>
  );
}
