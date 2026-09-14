"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startResearchAction } from "@/actions/research";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ResearchProgressProps {
  requestId: string;
  status: string;
}

/**
 * Shows meaningful research progress without exposing raw technical logs
 * (SYSTEM-DESIGN-NEXTJS.md §34.5). Only rendered while the request has not
 * yet produced any usable sources.
 */
export function ResearchProgress({ requestId, status }: ResearchProgressProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (status !== "draft") return null;

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startResearchAction(requestId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-medium">Research</h3>
      {isPending ? (
        <ol className="flex flex-col gap-1 text-sm text-muted-foreground">
          <li>Research plan created</li>
          <li>Discovering candidate sources...</li>
          <li>Retrieving source content...</li>
          <li>Analyzing evidence...</li>
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          Start research to discover and analyze sources for this topic.
        </p>
      )}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" onClick={handleStart} disabled={isPending} className="w-fit">
        {isPending ? "Researching..." : "Start research"}
      </Button>
    </div>
  );
}
