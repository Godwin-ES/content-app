"use client";

import { useState, useTransition } from "react";
import { useRequestActivity } from "@/components/requests/request-activity-context";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { retryArticleOptionAction, evaluateArticleAction, selectArticleAction, autoReviseArticleAction } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EvaluationSummary } from "@/components/articles/evaluation-summary";
import { EvaluationDrawer } from "@/components/articles/evaluation-drawer";
import { ArticleOptionEditor } from "@/components/articles/article-option-editor";
import { VersionHistory } from "@/components/articles/version-history";
import type { Database } from "@/lib/supabase/database.types";
import type { ArticleOutput } from "@/lib/ai/schemas/article";

type ContentArtifactRow = Database["public"]["Tables"]["content_artifacts"]["Row"];
type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];
type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];

interface ArticleOptionCardProps {
  requestId: string;
  artifact: ContentArtifactRow;
  currentVersion: ArtifactVersionRow | null;
  evaluation: EvaluationRow | null;
  versions: ArtifactVersionRow[];
  isSelected: boolean;
  canSelectAny: boolean;
  selectedArticleVersionId: string | null;
}

const ANGLE_LABEL: Record<string, string> = { A: "Practical", B: "Strategic", C: "Educational" };

/**
 * One article option in full (SYSTEM-DESIGN-NEXTJS.md §20, §34.7) — shown
 * on its own sub-tab (Phase 4 of the post-Task-22 UX pass), not cramped
 * side by side with the other two. Re-evaluate/Auto-revise/Targeted-
 * revision collapse down to Re-evaluate (a small secondary check) plus
 * per-section Edit/Regenerate inside ArticleOptionEditor — the server, not
 * this UI, is what actually enforces every eligibility rule.
 */
export function ArticleOptionCard({ requestId, artifact, currentVersion, evaluation, versions, isSelected, canSelectAny, selectedArticleVersionId }: ArticleOptionCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyCount, setBusyCount] = useState(0);
  const router = useRouter();

  const content = currentVersion?.content as unknown as ArticleOutput | undefined;
  const hasVersion = Boolean(currentVersion);
  // Changing your mind is allowed: the server only requires that the
  // version be the option's current one and that it passed evaluation, so
  // a different passing option can be chosen after one already is. Any
  // channels already adapted from the old choice are then flagged stale
  // rather than silently left pointing at a superseded article.
  const canSelect = evaluation?.overall_status === "pass" && !isSelected;
  const anotherOptionSelected = !isSelected && Boolean(selectedArticleVersionId);
  const needsRevision = evaluation?.overall_status === "revise";
  // The one automatic revision §18 allows is only offered while it is
  // actually available; after that the per-section Regenerate is the route.
  const autoReviseUsed = versions.some((v) => v.change_type === "automatic_revision");
  const canAutoRevise = needsRevision && !autoReviseUsed;
  /**
   * Anything running anywhere on this request, not just work started from
   * this card. Retrying, evaluating, revising or selecting an article
   * while it is being regenerated are all writers racing each other.
   */
  const { running: somethingRunning } = useRequestActivity();
  const locked = isPending || busyCount > 0 || somethingRunning;
  const handleBusyChange = (busy: boolean) => setBusyCount((c) => Math.max(0, c + (busy ? 1 : -1)));

  function retry() {
    setError(null);
    startTransition(async () => {
      const result = await retryArticleOptionAction(artifact.id);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  function evaluate() {
    if (!currentVersion) return;
    setError(null);
    startTransition(async () => {
      const result = await evaluateArticleAction(currentVersion.id);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  function autoRevise() {
    if (!currentVersion) return;
    setError(null);
    startTransition(async () => {
      const result = await autoReviseArticleAction(currentVersion.id);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  function select() {
    if (!currentVersion) return;
    setError(null);
    startTransition(async () => {
      const result = await selectArticleAction(requestId, currentVersion.id);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          Option {artifact.slot} · {ANGLE_LABEL[artifact.slot ?? ""] ?? ""}
        </span>
        <div className="flex items-center gap-2">
          {isSelected ? <Badge>Selected</Badge> : null}
          <Badge variant={hasVersion ? "outline" : "destructive"}>{hasVersion ? "Generated" : "Failed"}</Badge>
        </div>
      </div>

      {content ? (
        <>
          <EvaluationSummary evaluation={evaluation} />
          {evaluation ? <EvaluationDrawer evaluation={evaluation} /> : null}
          <VersionHistory versions={versions} currentVersionId={currentVersion?.id ?? null} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Generation failed for this option.</p>
      )}

      {hasVersion && !isSelected && evaluation && evaluation.overall_status !== "pass" ? (
        <p className="text-sm text-muted-foreground">
          This option has to be revised before it can be selected
          {canAutoRevise ? " — Auto-revise applies the evaluation's instructions to the sections it flagged, then re-evaluates." : "."}
        </p>
      ) : null}
      {hasVersion && !evaluation ? (
        <p className="text-sm text-muted-foreground">Evaluate this option before it can be selected.</p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!hasVersion ? (
          <Button type="button" size="sm" variant="outline" disabled={locked} onClick={retry} className="w-fit">
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Retrying...
              </>
            ) : (
              "Retry"
            )}
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" disabled={locked} onClick={evaluate} className="w-fit">
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Evaluating...
                </>
              ) : evaluation ? (
                "Re-evaluate"
              ) : (
                "Evaluate"
              )}
            </Button>
            {canAutoRevise ? (
              <Button type="button" size="sm" variant="outline" disabled={locked} onClick={autoRevise} className="w-fit">
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Revising...
                  </>
                ) : (
                  "Auto-revise"
                )}
              </Button>
            ) : null}
            {canSelect ? (
              <Button type="button" size="sm" disabled={locked || !canSelectAny} onClick={select} className="w-fit">
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Selecting...
                  </>
                ) : anotherOptionSelected ? (
                  "Select this option instead"
                ) : (
                  "Select this option"
                )}
              </Button>
            ) : null}
          </>
        )}
      </div>

      {content && currentVersion ? (
        <ArticleOptionEditor
          artifactId={artifact.id}
          articleVersionId={currentVersion.id}
          content={content}
          revisionInstructions={evaluation?.revision_instructions ?? null}
          sectionsNeedingRevision={(evaluation?.sections_needing_revision as string[] | null) ?? []}
          locked={locked}
          onBusyChange={handleBusyChange}
        />
      ) : null}
    </div>
  );
}
