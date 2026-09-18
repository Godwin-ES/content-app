"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { recordSourceDecisionAction, deleteSourceAction } from "@/actions/sources";
import { startSourceAction } from "@/actions/research";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SourceEvidenceDrawer } from "@/components/research/source-evidence-drawer";
import { LocalDateTime } from "@/components/shared/local-date-time";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];
type SourceEvidenceRow = Database["public"]["Tables"]["source_evidence"]["Row"];

const ORIGIN_LABEL: Record<ResearchSourceRow["origin"], string> = {
  researched: "Found by research",
  user_url: "Provided by Content Manager",
  uploaded_material: "Uploaded by Content Manager",
};

interface SourceCardProps {
  source: ResearchSourceRow;
  evidence: SourceEvidenceRow[];
  decision: "accepted" | "excluded" | null;
  hasConflict: boolean;
  /** Hides Accept/Exclude — used once the source set is already confirmed, where a decision can no longer be changed. */
  showDecisionControls?: boolean;
  /** True while any other research operation on this page is in flight, so two can never race over the same request. */
  locked?: boolean;
  /** Reports when this card's own action starts/ends, so the parent can lock every other control on the tab while it runs. */
  onBusyChange?: (busy: boolean) => void;
  /**
   * Excluded from the current research scope — a web result while
   * "supplied only" is ticked. Dimmed and undecidable rather than hidden:
   * it is real history, and it comes back the moment the box is unticked.
   */
  outOfScope?: boolean;
}

/**
 * Source Review card (SYSTEM-DESIGN-NEXTJS.md §10.1). No numeric trust
 * score — the Content Manager inspects origin, freshness, and evidence
 * directly and makes an explicit accept/exclude call. A user-supplied
 * source starts with no decision, exactly like a researched one.
 *
 * Shows every retrieval_status in place — including the failure reason and
 * a Retry — rather than only ever surfacing that once the source set has
 * already been confirmed (Phase 2 of the post-Task-22 UX pass): you need
 * exactly this information to decide whether a failed source is worth
 * retrying before confirming.
 */
export function SourceCard({
  source,
  evidence,
  decision,
  hasConflict,
  showDecisionControls = true,
  locked = false,
  onBusyChange,
  outOfScope = false,
}: SourceCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"accept" | "exclude" | "start" | "remove" | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isUsable = source.retrieval_status === "usable";
  const publishedYearsAgo = source.published_at
    ? new Date().getFullYear() - new Date(source.published_at).getFullYear()
    : null;

  function decide(next: "accepted" | "excluded") {
    setError(null);
    setPendingAction(next === "accepted" ? "accept" : "exclude");
    startTransition(async () => {
      const result = await recordSourceDecisionAction(source.id, next, null);
      setPendingAction(null);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  function start() {
    setError(null);
    setPendingAction("start");
    onBusyChange?.(true);
    startTransition(async () => {
      const result = await startSourceAction(source.id);
      setPendingAction(null);
      onBusyChange?.(false);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  function remove() {
    setError(null);
    setPendingAction("remove");
    onBusyChange?.(true);
    startTransition(async () => {
      const result = await deleteSourceAction(source.id);
      setPendingAction(null);
      onBusyChange?.(false);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  const disabled = isPending || locked || outOfScope;
  const displayTitle = source.title ?? source.original_url ?? "Untitled";

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-4", outOfScope && "opacity-55")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {source.original_url ? (
            <a href={source.original_url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
              {displayTitle}
            </a>
          ) : (
            <span className="truncate font-medium">{displayTitle}</span>
          )}
          <span className="truncate text-xs text-muted-foreground">
            {/* A supplied file or link has no publisher to report, and saying
                "Unknown publisher" of something the Content Manager handed
                over reads as a failure rather than a fact — so where there
                is no publisher, the provenance stands on its own. */}
            {source.publisher ? `${source.publisher} · ` : ""}
            {ORIGIN_LABEL[source.origin]}
            {source.published_at ? (
              <>
                {" · "}
                <LocalDateTime value={source.published_at} dateOnly />
              </>
            ) : null}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {outOfScope ? <Badge variant="secondary">Outside this scope</Badge> : null}
          {decision ? <Badge variant={decision === "accepted" ? "default" : "secondary"}>{decision}</Badge> : null}
          {hasConflict ? <Badge variant="destructive">Conflict</Badge> : null}
          {publishedYearsAgo !== null && publishedYearsAgo >= 2 ? <Badge variant="outline">Freshness warning</Badge> : null}
          <Badge variant={source.retrieval_status === "pending" ? "secondary" : source.retrieval_status === "failed" ? "destructive" : "outline"}>
            {source.retrieval_status}
          </Badge>
        </div>
      </div>

      {source.retrieval_status === "failed" && source.retrieval_error ? (
        <p className="text-xs text-destructive">{source.retrieval_error}</p>
      ) : null}

      {/* The analyzer's own view, offered before the decision is made and
          left behind once it has been: once you have accepted or excluded
          a source, what the machine would have suggested is history. */}
      {!decision && source.recommendation && source.recommendation_reason ? (
        <p className="flex flex-wrap items-start gap-1.5 text-xs">
          <Badge variant={source.recommendation === "accept" ? "outline" : "secondary"} className="shrink-0">
            Suggests {source.recommendation === "accept" ? "Accept" : "Exclude"}
          </Badge>
          <span className="min-w-0 flex-1 text-muted-foreground">{source.recommendation_reason}</span>
        </p>
      ) : null}

      {isUsable ? <SourceEvidenceDrawer evidence={evidence} /> : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {/* Retry only. A source waiting to be researched is picked up by
            the tab's own Start research button along with everything else
            added since the last run — giving it a second button here meant
            two ways to do one thing, and neither said which. Re-fetching a
            page that failed is a different, cheaper operation, and it is
            still worth doing one at a time. */}
        {source.retrieval_status === "failed" ? (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={start}>
            {pendingAction === "start" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Working...
              </>
            ) : (
              "Retry"
            )}
          </Button>
        ) : null}
        {source.retrieval_status === "pending" ? (
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={remove}>
            {pendingAction === "remove" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Removing...
              </>
            ) : (
              "Remove"
            )}
          </Button>
        ) : null}
        {showDecisionControls ? (
          <>
            <Button
              type="button"
              size="sm"
              variant={decision === "accepted" ? "default" : "outline"}
              disabled={!isUsable || disabled}
              onClick={() => decide("accepted")}
            >
              {pendingAction === "accept" ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Accepting...
                </>
              ) : (
                "Accept"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={decision === "excluded" ? "default" : "outline"}
              disabled={disabled}
              onClick={() => decide("excluded")}
            >
              {pendingAction === "exclude" ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Excluding...
                </>
              ) : (
                "Exclude"
              )}
            </Button>
          </>
        ) : null}
      </div>
      {showDecisionControls && !isUsable && source.retrieval_status !== "pending" && source.retrieval_status !== "failed" ? (
        <p className="text-xs text-muted-foreground">No notable evidence could be extracted from this page.</p>
      ) : null}
    </div>
  );
}
