"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, MessageSquareWarning } from "lucide-react";
import { decideOwnPackageAction, withdrawApprovalAction } from "@/actions/approvals";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ApprovalPanelProps {
  requestId: string;
  requestStatus: string;
  hasCurrentPackage: boolean;
  /** A review left pending from before approving became one step. */
  pendingReviewId: string | null;
}

/**
 * The approval gate, as one person experiences it.
 *
 * It used to be two acts by two people: a Content Manager submitted, a
 * Reviewer decided. With one account, handing the package to yourself was
 * pure ceremony — a button whose only effect was to make the next button
 * appear. Approve and Request changes now act directly on the package.
 *
 * The gate itself is unchanged, and deliberately so: nothing can be queued
 * for publishing until a human has looked at a specific package version
 * and decided on it, and that decision is still recorded against that
 * version with its author and timestamp.
 */
export function ApprovalPanel({ requestId, requestStatus, hasCurrentPackage, pendingReviewId }: ApprovalPanelProps) {
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const router = useRouter();

  function decide(decision: "approved" | "changes_requested") {
    setError(null);
    startTransition(async () => {
      const result = await decideOwnPackageAction(requestId, decision, comment.trim() || null);
      if (result.ok) {
        setComment("");
        setShowComment(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
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

  const errorAlert = error ? (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  if (requestStatus === "approved") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Check aria-hidden className="size-4" />
          Approved. This package can be queued for publishing.
        </p>
        <Link href={`/publishing`} className="w-fit text-sm underline">
          Go to the publishing queue
        </Link>
      </div>
    );
  }

  const canDecide =
    hasCurrentPackage &&
    ["content_development", "changes_requested", "pending_approval"].includes(requestStatus);

  if (!canDecide) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">
        Approving locks this exact package version and makes it available to publish. Asking for changes records what needs
        fixing and reopens the request for edits.
      </p>

      {showComment ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="review-comment">What needs to change?</Label>
          <Textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="The intro buries the finding — lead with it."
            autoFocus
          />
        </div>
      ) : null}

      {errorAlert}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => decide("approved")} disabled={busy}>
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
          Approve for publishing
        </Button>

        {showComment ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => decide("changes_requested")} disabled={busy || !comment.trim()}>
              Save changes needed
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowComment(false)} disabled={busy}>
              Cancel
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowComment(true)} disabled={busy}>
            <MessageSquareWarning aria-hidden className="size-4" />
            Note changes needed
          </Button>
        )}

        {pendingReviewId ? (
          <Button type="button" size="sm" variant="ghost" onClick={withdraw} disabled={busy}>
            Withdraw submission
          </Button>
        ) : null}
      </div>
    </div>
  );
}
