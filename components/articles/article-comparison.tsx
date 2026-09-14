"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateArticleOptionsAction } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArticleOptionCard } from "@/components/articles/article-option-card";
import type { Database } from "@/lib/supabase/database.types";

type ContentArtifactRow = Database["public"]["Tables"]["content_artifacts"]["Row"];
type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];
type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];

interface ArticleComparisonProps {
  requestId: string;
  articleArtifacts: ContentArtifactRow[];
  currentVersionsByArtifact: Record<string, ArtifactVersionRow | null>;
  evaluationsByArtifact: Record<string, EvaluationRow | null>;
  versionsByArtifact: Record<string, ArtifactVersionRow[]>;
  selectedArticleVersionId: string | null;
  canGenerate: boolean;
}

/**
 * Article generation trigger + compact option comparison
 * (SYSTEM-DESIGN-NEXTJS.md §15, §34.7).
 */
export function ArticleComparison({
  requestId,
  articleArtifacts,
  currentVersionsByArtifact,
  evaluationsByArtifact,
  versionsByArtifact,
  selectedArticleVersionId,
  canGenerate,
}: ArticleComparisonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateArticleOptionsAction(requestId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Article Options</h3>
        {articleArtifacts.length === 0 || articleArtifacts.some((a) => !a.current_version_id) ? (
          <Button type="button" size="sm" onClick={generate} disabled={!canGenerate || isPending}>
            {isPending ? "Generating..." : articleArtifacts.length === 0 ? "Generate article options" : "Retry all"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {articleArtifacts.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {articleArtifacts.map((artifact) => (
            <ArticleOptionCard
              key={artifact.id}
              requestId={requestId}
              artifact={artifact}
              currentVersion={currentVersionsByArtifact[artifact.id] ?? null}
              evaluation={evaluationsByArtifact[artifact.id] ?? null}
              versions={versionsByArtifact[artifact.id] ?? []}
              isSelected={
                currentVersionsByArtifact[artifact.id]?.id !== undefined &&
                currentVersionsByArtifact[artifact.id]?.id === selectedArticleVersionId
              }
              canSelectAny={selectedArticleVersionId === null}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No article options generated yet.</p>
      )}
    </div>
  );
}
