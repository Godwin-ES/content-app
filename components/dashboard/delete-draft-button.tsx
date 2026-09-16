"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRequestAction } from "@/actions/requests";
import { Button } from "@/components/ui/button";

/**
 * Deletion is only ever offered for a `draft` request — the server action
 * re-checks this itself (delete_draft_request), so this button is a
 * convenience, not the actual enforcement point.
 */
export function DeleteDraftButton({ requestId }: { requestId: string }) {
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
