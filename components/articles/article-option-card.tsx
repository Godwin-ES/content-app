"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryArticleOptionAction } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Database } from "@/lib/supabase/database.types";
import type { ArticleOutput } from "@/lib/ai/schemas/article";

type ContentArtifactRow = Database["public"]["Tables"]["content_artifacts"]["Row"];
type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];

interface ArticleOptionCardProps {
  artifact: ContentArtifactRow;
  currentVersion: ArtifactVersionRow | null;
}

const ANGLE_LABEL: Record<string, string> = { A: "Practical", B: "Strategic", C: "Educational" };

/**
 * Compact option card (SYSTEM-DESIGN-NEXTJS.md §20, §34.7) — never a full
 * article rendered side by side with two others. Selecting/opening the
 * full article is a Task 14 concern.
 */
export function ArticleOptionCard({ artifact, currentVersion }: ArticleOptionCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const content = currentVersion?.content as unknown as ArticleOutput | undefined;
  const hasVersion = Boolean(currentVersion);

  function retry() {
    setError(null);
    startTransition(async () => {
      const result = await retryArticleOptionAction(artifact.id);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          Option {artifact.slot} · {ANGLE_LABEL[artifact.slot ?? ""] ?? ""}
        </span>
        <Badge variant={hasVersion ? "outline" : "destructive"}>{hasVersion ? "Generated" : "Failed"}</Badge>
      </div>

      {content ? (
        <>
          <h4 className="font-medium">{content.title}</h4>
          <p className="line-clamp-2 text-sm text-muted-foreground">{content.metaDescription}</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Generation failed for this option.</p>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!hasVersion ? (
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={retry} className="w-fit">
          {isPending ? "Retrying..." : "Retry"}
        </Button>
      ) : null}
    </div>
  );
}
