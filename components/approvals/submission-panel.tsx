"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitForApprovalAction, withdrawApprovalAction, reopenRejectedRequestAction } from "@/actions/approvals";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SubmissionPanelProps {
  requestId: string;
  requestStatus: string;
  hasCurrentPackage: boolean;
  pendingReviewId: string | null;
}

/**
 * Create Package -> Submit for Approval progression (SYSTEM-DESIGN-NEXTJS.md
 * §24.1, §24.5): submitting makes the exact package read-only for review;
 * withdrawing (only while still pending) returns the request to content
 * development; a rejected request only reopens through this explicit,
 * logged action, never automatically.
 */
export function SubmissionPanel({ requestId, requestStatus, hasCurrentPackage, pendingReviewId }: SubmissionPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitForApprovalAction(requestId);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  function withdraw() {
    if (!pendingReviewId) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawApprovalAction(pendingReviewId);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  function reopen() {
    setError(null);
    startTransition(async () => {
      const result = await reopenRejectedRequestAction(requestId);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  const errorAlert = error ? (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  if (requestStatus === "pending_approval" && pendingReviewId) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">This package is submitted and pending review. Content is read-only until you withdraw.</p>
        {errorAlert}
        <Button type="button" size="sm" variant="outline" onClick={withdraw} disabled={isPending} className="w-fit">
          {isPending ? "Withdrawing..." : "Withdraw Submission"}
        </Button>
      </div>
    );
  }

  if (requestStatus === "rejected") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">This request was rejected. Reopen it to continue content development.</p>
        {errorAlert}
        <Button type="button" size="sm" onClick={reopen} disabled={isPending} className="w-fit">
          {isPending ? "Reopening..." : "Reopen for Content Development"}
        </Button>
      </div>
    );
  }

  if (requestStatus === "content_development" || requestStatus === "changes_requested") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        {errorAlert}
        <Button type="button" size="sm" onClick={submit} disabled={!hasCurrentPackage || isPending} className="w-fit">
          {isPending ? "Submitting..." : "Submit for Approval"}
        </Button>
      </div>
    );
  }

  return null;
}
