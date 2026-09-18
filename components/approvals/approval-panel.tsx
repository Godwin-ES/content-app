"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { approvePackageAction } from "@/actions/approvals";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAutoMode } from "@/components/requests/auto-mode-context";

/**
 * The approval gate, as one person experiences it: one button.
 *
 * It used to be two acts by two people — a Content Manager submitted, a
 * Reviewer decided — and briefly two buttons for one person, where "note
 * changes needed" wrote yourself a message about work you were about to do
 * anyway. If the package is not right you edit it, and editing returns the
 * request to development on its own.
 *
 * The gate itself is unchanged, and deliberately so: nothing can be queued
 * for publishing until a human has read a specific package version and
 * approved it, and that approval is recorded against that version with its
 * author and timestamp.
 */
export function ApprovalPanel({
  requestId,
  requestStatus,
  hasCurrentPackage,
}: {
  requestId: string;
  requestStatus: string;
  hasCurrentPackage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const { running: autoModeRunning } = useAutoMode();
  const [busy, startTransition] = useTransition();
  const router = useRouter();

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approvePackageAction(requestId);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  if (requestStatus === "approved") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Check aria-hidden className="size-4" />
          Approved. This package can be queued for publishing.
        </p>
        <p className="text-sm text-muted-foreground">
          Editing anything below starts a new version and returns the request to development — the approved package stays exactly
          as it was.
        </p>
        <Link href="/publishing" className="w-fit text-sm underline">
          Go to the publishing queue
        </Link>
      </div>
    );
  }

  if (requestStatus !== "content_development" || !hasCurrentPackage) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">
        Approving locks this exact package version and makes it available to publish. If something needs changing, edit it
        instead — that starts a new version and there is nothing to undo.
      </p>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" size="sm" className="w-fit" onClick={approve} disabled={busy || autoModeRunning}>
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
        Approve for publishing
      </Button>
    </div>
  );
}
