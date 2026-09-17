"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRequestAction } from "@/actions/requests";
import { Button } from "@/components/ui/button";

/**
 * Offered until a Reviewer has responded to the request. The server action
 * re-checks that itself (delete_request), so this button is a convenience,
 * not the actual enforcement point.
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
