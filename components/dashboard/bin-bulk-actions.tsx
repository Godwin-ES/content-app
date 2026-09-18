"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Undo2 } from "lucide-react";
import { purgeAllDeletedRequestsAction, restoreAllDeletedRequestsAction } from "@/actions/requests";
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
 * Restore everything, or empty the bin.
 *
 * Only Delete all confirms. Restore all is the safe direction — the worst
 * it does is put things back where a second click can re-bin them — and a
 * confirmation on a harmless action teaches people to click through the
 * one that matters.
 *
 * Both report how many they got through rather than assuming, because a
 * single request can fail on its own (a provenance row, a bucket that
 * refuses) and the rest still go.
 */
export function BinBulkActions({ count }: { count: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function restoreAll() {
    setError(null);
    startTransition(async () => {
      const result = await restoreAllDeletedRequestsAction();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (result.data.failed > 0) {
        setError(`${result.data.done} restored, ${result.data.failed} could not be.`);
      }
      router.refresh();
    });
  }

  function purgeAll() {
    setError(null);
    startTransition(async () => {
      const result = await purgeAllDeletedRequestsAction();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setConfirming(false);
      if (result.data.failed > 0) {
        setError(`${result.data.done} deleted, ${result.data.failed} could not be.`);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={restoreAll} disabled={isPending}>
          <Undo2 aria-hidden className="size-4" />
          Restore all
        </Button>

        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={isPending}
              />
            }
          >
            <Trash2 aria-hidden className="size-4" />
            Delete all
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Empty the bin?</DialogTitle>
              <DialogDescription>
                All {count} request{count === 1 ? "" : "s"} in the bin, and everything belonging to them — sources, evidence,
                plans, every article version and every uploaded file — will be removed immediately. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={purgeAll} disabled={isPending}>
                {isPending ? "Deleting..." : `Delete all ${count}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
