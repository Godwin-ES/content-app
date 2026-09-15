"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideApprovalAction } from "@/actions/approvals";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ReviewDecisionPanelProps {
  reviewId: string;
  packageId: string;
  isPending: boolean;
}

/**
 * The Reviewer's three decisions (SYSTEM-DESIGN-NEXTJS.md §24.2). The
 * server (decide_package_review RPC) is the actual authority on every
 * eligibility rule — role, self-approval, staleness, pending status — this
 * UI only presents the choice.
 */
export function ReviewDecisionPanel({ reviewId, packageId, isPending }: ReviewDecisionPanelProps) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const router = useRouter();

  function decide(decision: "approved" | "changes_requested" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await decideApprovalAction(reviewId, packageId, decision, comment.trim() || null);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  if (!isPending) {
    return <p className="text-sm text-muted-foreground">This review has already been decided.</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="review-comment">Comment (optional, required recommended for Changes Requested/Rejected)</Label>
        <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => decide("approved")} disabled={busy}>
          {busy ? "Saving..." : "Approve"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => decide("changes_requested")} disabled={busy}>
          Request Changes
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={() => decide("rejected")} disabled={busy}>
          Reject
        </Button>
      </div>
    </div>
  );
}
