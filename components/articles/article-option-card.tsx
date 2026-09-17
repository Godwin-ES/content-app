"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryArticleOptionAction, evaluateArticleAction, selectArticleAction } from "@/actions/articles";
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
export function ArticleOptionCard({ requestId, artifact, currentVersion, evaluation, versions, isSelected, canSelectAny }: ArticleOptionCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busyCount, setBusyCount] = useState(0);
  const router = useRouter();

  const content = currentVersion?.content as unknown as ArticleOutput | undefined;
  const hasVersion = Boolean(currentVersion);
  const canSelect = evaluation?.overall_status === "pass" && !isSelected;
  const locked = isPending || busyCount > 0;
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

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!hasVersion ? (
          <Button type="button" size="sm" variant="outline" disabled={locked} onClick={retry} className="w-fit">
            {isPending ? "Retrying..." : "Retry"}
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" disabled={locked} onClick={evaluate} className="w-fit">
              {isPending ? "Evaluating..." : evaluation ? "Re-evaluate" : "Evaluate"}
            </Button>
            {canSelect ? (
              <Button type="button" size="sm" disabled={locked || !canSelectAny} onClick={select} className="w-fit">
                {isPending ? "Selecting..." : "Select this option"}
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
          defaultInstruction={evaluation?.revision_instructions ?? null}
          locked={locked}
          onBusyChange={handleBusyChange}
        />
      ) : null}
    </div>
  );
}
