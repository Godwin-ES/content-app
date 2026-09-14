"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  retryArticleOptionAction,
  evaluateArticleAction,
  autoReviseArticleAction,
  selectArticleAction,
} from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EvaluationSummary } from "@/components/articles/evaluation-summary";
import { EvaluationDrawer } from "@/components/articles/evaluation-drawer";
import { ArticleEditor } from "@/components/articles/article-editor";
import { TargetedRevisionPanel } from "@/components/articles/targeted-revision-panel";
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
 * Compact option card (SYSTEM-DESIGN-NEXTJS.md §20, §34.7). Opening an
 * option reveals its full editable article, revision history, targeted-
 * revision panel, and (once passing) an explicit Select action — the
 * server, not this UI, is what actually enforces every eligibility rule.
 */
export function ArticleOptionCard({
  requestId,
  artifact,
  currentVersion,
  evaluation,
  versions,
  isSelected,
  canSelectAny,
}: ArticleOptionCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const content = currentVersion?.content as unknown as ArticleOutput | undefined;
  const hasVersion = Boolean(currentVersion);
  const canAutoRevise = evaluation?.overall_status === "revise";
  const canSelect = evaluation?.overall_status === "pass" && !isSelected;

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
    <div className="flex flex-col gap-2 rounded-lg border p-4">
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
          <h4 className="font-medium">{content.title}</h4>
          <p className="line-clamp-2 text-sm text-muted-foreground">{content.metaDescription}</p>
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
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={retry} className="w-fit">
            {isPending ? "Retrying..." : "Retry"}
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={evaluate} className="w-fit">
              {isPending ? "Evaluating..." : evaluation ? "Re-evaluate" : "Evaluate"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)} className="w-fit">
              {open ? "Close" : "Open"}
            </Button>
            {canAutoRevise ? (
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={autoRevise} className="w-fit">
                {isPending ? "Revising..." : "Auto-revise"}
              </Button>
            ) : null}
            {canSelect ? (
              <Button type="button" size="sm" disabled={isPending || !canSelectAny} onClick={select} className="w-fit">
                {isPending ? "Selecting..." : "Select this option"}
              </Button>
            ) : null}
          </>
        )}
      </div>

      {open && content ? (
        <div className="flex flex-col gap-4 border-t pt-4">
          <ArticleEditor artifactId={artifact.id} content={content} />
          {currentVersion ? <TargetedRevisionPanel articleVersionId={currentVersion.id} currentContent={content} /> : null}
        </div>
      ) : null}
    </div>
  );
}
