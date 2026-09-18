"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawApprovalAction } from "@/actions/approvals";
import { Button } from "@/components/ui/button";

/**
 * Offered instead of Delete while a request is submitted and awaiting a
 * decision. Deleting is technically allowed at that point — nothing has
 * been decided — but it is far more likely a slip than an intent;
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
