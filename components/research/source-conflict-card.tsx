"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveSourceConflictAction } from "@/actions/sources";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Database } from "@/lib/supabase/database.types";

type SourceConflictRow = Database["public"]["Tables"]["source_conflicts"]["Row"];

interface SourceConflictCardProps {
  conflict: SourceConflictRow;
  sourceALabel: string;
  sourceBLabel: string;
}

const RESOLUTION_OPTIONS: Array<{ value: "prefer_source_a" | "prefer_source_b" | "present_both" | "avoid_claim"; label: string }> = [
  { value: "prefer_source_a", label: "Prefer source A" },
  { value: "prefer_source_b", label: "Prefer source B" },
  { value: "present_both", label: "Present both" },
  { value: "avoid_claim", label: "Avoid the claim" },
];

/**
 * Surfaces a material contradiction between two accepted sources
 * (SYSTEM-DESIGN-NEXTJS.md §10.4). The system never silently picks the
 * source that best fits an intended angle; the Content Manager decides.
 */
export function SourceConflictCard({ conflict, sourceALabel, sourceBLabel }: SourceConflictCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (conflict.resolution) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Conflict resolved: <strong>{conflict.resolution.replace(/_/g, " ")}</strong>
        {conflict.resolution_note ? ` — ${conflict.resolution_note}` : ""}
      </div>
    );
  }

  function resolve(resolution: (typeof RESOLUTION_OPTIONS)[number]["value"]) {
    setError(null);
    startTransition(async () => {
      const result = await resolveSourceConflictAction(conflict.id, resolution, null);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
      <p className="text-sm font-medium">
        Conflict between {sourceALabel} and {sourceBLabel}
      </p>
      <p className="text-sm text-muted-foreground">{conflict.description}</p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {RESOLUTION_OPTIONS.map((option) => (
          <Button key={option.value} type="button" size="sm" variant="outline" disabled={isPending} onClick={() => resolve(option.value)}>
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
