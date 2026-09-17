"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawApprovalAction } from "@/actions/approvals";
import { Button } from "@/components/ui/button";

/**
 * Offered instead of Delete while a request is out for review. Deleting
 * from under a Reviewer would be the wrong move even where the rules allow
 * it (nothing has been decided yet, so it is technically deletable);
 * withdrawing pulls the submission back and returns the request to
 * In Progress, where it can be edited — or deleted — deliberately.
 */
export function WithdrawSubmissionButton({ reviewId }: { reviewId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleWithdraw(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    startTransition(async () => {
      const result = await withdrawApprovalAction(reviewId);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleWithdraw}>
        {isPending ? "Withdrawing..." : "Withdraw submission"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
