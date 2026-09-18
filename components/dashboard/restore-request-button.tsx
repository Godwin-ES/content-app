"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { restoreRequestAction } from "@/actions/requests";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Takes a request back out of the bin. No confirmation step — restoring is
 * the safe direction, and a mistaken restore costs one click to undo.
 *
 * A restore past the 30-day window is refused by the database, which is the
 * only place that can decide it: the listing filters on the same window, so
 * this button should never be reachable for an expired request, but if the
 * page has been open a while it might be.
 */
export function RestoreRequestButton({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleRestore(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    startTransition(async () => {
      const result = await restoreRequestAction(requestId);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleRestore}>
        <Undo2 aria-hidden className="size-4" />
        {isPending ? "Restoring..." : "Restore"}
      </Button>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
