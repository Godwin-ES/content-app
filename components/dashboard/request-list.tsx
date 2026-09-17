import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LocalDateTime } from "@/components/shared/local-date-time";
import { DeleteRequestButton } from "@/components/dashboard/delete-request-button";
import { WithdrawSubmissionButton } from "@/components/dashboard/withdraw-submission-button";
import { RequestStage } from "@/components/dashboard/request-stage";
import type { Database } from "@/lib/supabase/database.types";
import type { PipelineProgress } from "@/lib/workspace/next-action";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];

const STATUS_LABELS: Record<ContentRequestRow["status"], string> = {
  draft: "Draft",
  source_review: "Source Review",
  content_development: "In Development",
  pending_approval: "Pending Approval",
  changes_requested: "Changes Requested",
  approved: "Approved",
  archived: "Archived",
};

interface RequestListProps {
  requests: ContentRequestRow[];
  /** The still-pending review for each submitted request, so it can be withdrawn from here. */
  pendingReviewIdByRequest?: Record<string, string>;
  progressByRequest?: Record<string, PipelineProgress>;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function RequestList({
  requests,
  pendingReviewIdByRequest = {},
  progressByRequest = {},
  emptyTitle = "No requests yet",
  emptyDescription = "Start one from the button above.",
}: RequestListProps) {
  if (requests.length === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {requests.map((request) => {
        const pendingReviewId = pendingReviewIdByRequest[request.id];

        return (
          <div key={request.id} className="flex flex-col gap-3 p-4 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
            <Link href={`/requests/${request.id}`} className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="font-medium">{request.topic}</span>
              <RequestStage progress={progressByRequest[request.id]} />
              <span className="text-xs text-muted-foreground">
                Updated <LocalDateTime value={request.updated_at} />
              </span>
            </Link>

            <div className="flex shrink-0 items-center gap-3">
              <Badge variant="outline">{STATUS_LABELS[request.status]}</Badge>
              {/* Out for review: withdraw rather than delete. Nothing has
                  been decided yet so deleting is technically allowed, but
                  pulling it out from under the Reviewer is the wrong move —
                  withdrawing returns it to In Progress, where deleting is a
                  deliberate second step. Once a Reviewer has responded,
                  neither is offered; the server refuses the delete anyway,
                  to protect their feedback. */}
              {request.status === "pending_approval" ? (
                pendingReviewId ? (
                  <WithdrawSubmissionButton reviewId={pendingReviewId} />
                ) : null
              ) : request.status === "changes_requested" || request.status === "approved" ? null : (
                <DeleteRequestButton requestId={request.id} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
