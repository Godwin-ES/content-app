"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retrySourceAction } from "@/actions/research";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";

type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];

interface ResearchFailureListProps {
  sources: ResearchSourceRow[];
}

/**
 * Shows usable sources alongside retrieval failures with a retry action, so
 * a partial failure (e.g. 2 of 8 retrievals failed) stays transparent
 * rather than silently dropped (SYSTEM-DESIGN-NEXTJS.md §9.2 research
 * progress, §26.1 failure principle).
 */
export function ResearchFailureList({ sources }: ResearchFailureListProps) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (sources.length === 0) return null;

  const usable = sources.filter((s) => s.retrieval_status === "usable");
  const unusable = sources.filter((s) => s.retrieval_status === "unusable");
  const failed = sources.filter((s) => s.retrieval_status === "failed");

  function handleRetry(sourceId: string) {
    setRetryingId(sourceId);
    startTransition(async () => {
      await retrySourceAction(sourceId);
      setRetryingId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">
        Sources ({usable.length} usable{failed.length > 0 ? `, ${failed.length} failed` : ""}
        {unusable.length > 0 ? `, ${unusable.length} unusable` : ""})
      </h3>
      <ul className="flex flex-col divide-y rounded-lg border">
        {sources.map((source) => (
          <li key={source.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-medium">{source.title ?? source.original_url}</span>
              <span className="truncate text-xs text-muted-foreground">{source.original_url}</span>
              {source.retrieval_status === "failed" && source.retrieval_error ? (
                <span className="text-xs text-destructive">{source.retrieval_error}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  source.retrieval_status === "usable"
                    ? "outline"
                    : source.retrieval_status === "failed"
                      ? "destructive"
                      : "secondary"
                }
              >
                {source.retrieval_status}
              </Badge>
              {source.retrieval_status === "failed" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending && retryingId === source.id}
                  onClick={() => handleRetry(source.id)}
                >
                  {isPending && retryingId === source.id ? "Retrying..." : "Retry"}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
