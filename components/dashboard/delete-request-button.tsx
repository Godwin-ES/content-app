"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRequestAction } from "@/actions/requests";
import { Button } from "@/components/ui/button";

/**
 * Offered on every live request, at any stage. Deleting used to be
 * permanent, which is why it was hedged about with rules — refused once a
 * Reviewer had responded, replaced by "withdraw" while a package was out.
 * It is a bin now, reversible for 30 days, so there is nothing left for
 * those rules to protect.
 *
 * The click-to-confirm stays: undoing is easy, but not noticing is not.
 */
export function DeleteRequestButton({ requestId }: { requestId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      await deleteRequestAction(requestId);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant={confirming ? "destructive" : "ghost"}
      size="sm"
      disabled={isPending}
      onClick={handleDelete}
      onBlur={() => setConfirming(false)}
    >
      {isPending ? "Deleting..." : confirming ? "Confirm delete" : "Delete"}
    </Button>
  );
}
