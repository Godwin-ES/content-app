"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { purgeRequestAction } from "@/actions/requests";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Removes a binned request for good, before its thirty days are up.
 *
 * Confirmed, unlike Restore, because this is the one direction that cannot
 * be undone: the request, its sources, its evidence, every article version
 * and every uploaded file go, and there is nothing left to restore from.
 * The dialog names the request so the confirmation is about a specific
 * thing rather than a generic "are you sure".
 */
export function PurgeRequestButton({ requestId, topic }: { requestId: string; topic: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handlePurge() {
    setError(null);
    startTransition(async () => {
      const result = await purgeRequestAction(requestId);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            // The row is a link to the request; without this, confirming a
            // deletion would also navigate into the thing being deleted.
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          />
        }
      >
        <Trash2 aria-hidden className="size-4" />
        Delete forever
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this request forever?</DialogTitle>
          <DialogDescription>
            &ldquo;{topic}&rdquo; and everything belonging to it — its sources, evidence, plan, every article version and every
            uploaded file — will be removed immediately. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handlePurge} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete forever"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
