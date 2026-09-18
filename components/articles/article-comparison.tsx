"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateArticleOptionsAction } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArticleOptionCard } from "@/components/articles/article-option-card";
import type { Database } from "@/lib/supabase/database.types";
import { useAutoMode, useOperationRunning } from "@/components/requests/auto-mode-context";

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
 * Article generation trigger + option sub-tabs (SYSTEM-DESIGN-NEXTJS.md
 * §15, §34.7). Each option gets its own full-width tab (Phase 4 of the
 * post-Task-22 UX pass) instead of three cramped side-by-side columns.
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
  const { running: somethingRunning } = useAutoMode();
  /**
   * Generation is running somewhere, from the operation table rather than
   * this component's transition — so returning to this tab mid-generation
   * finds a button that is still generating, not one offering to start
   * again.
   */
  const generating = useOperationRunning("article_generation", "article_evaluation");
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
          <Button
            type="button"
            size="sm"
            onClick={generate}
            disabled={!canGenerate || isPending || somethingRunning || generating}
          >
            {isPending || generating ? "Generating..." : articleArtifacts.length === 0 ? "Generate article" : "Retry"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {articleArtifacts.length > 0 ? (
        <Tabs defaultValue={articleArtifacts[0].id}>
          <TabsList>
            {articleArtifacts.map((artifact) => {
              const version = currentVersionsByArtifact[artifact.id];
              const isSelected = version?.id !== undefined && version.id === selectedArticleVersionId;
              return (
                <TabsTrigger key={artifact.id} value={artifact.id} className="flex items-center gap-2">
                  Option {artifact.slot}
                  {!artifact.current_version_id ? (
                    <Badge variant="destructive">Failed</Badge>
                  ) : isSelected ? (
                    <Badge>Selected</Badge>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {articleArtifacts.map((artifact) => (
            <TabsContent key={artifact.id} value={artifact.id}>
              <div className="pt-4">
                <ArticleOptionCard
                  requestId={requestId}
                  artifact={artifact}
                  currentVersion={currentVersionsByArtifact[artifact.id] ?? null}
                  evaluation={evaluationsByArtifact[artifact.id] ?? null}
                  versions={versionsByArtifact[artifact.id] ?? []}
                  isSelected={
                    currentVersionsByArtifact[artifact.id]?.id !== undefined &&
                    currentVersionsByArtifact[artifact.id]?.id === selectedArticleVersionId
                  }
                  canSelectAny
                  selectedArticleVersionId={selectedArticleVersionId}
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <p className="text-sm text-muted-foreground">No article options generated yet.</p>
      )}
    </div>
  );
}
