import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LocalDateTime } from "@/components/shared/local-date-time";
import { DeleteRequestButton } from "@/components/dashboard/delete-request-button";
import { RestoreRequestButton } from "@/components/dashboard/restore-request-button";
import { RequestStage } from "@/components/dashboard/request-stage";
import { DELETED_REQUEST_RETENTION_DAYS } from "@/lib/domain/retention";
import type { Database } from "@/lib/supabase/database.types";
import type { PipelineProgress } from "@/lib/workspace/next-action";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];

const STATUS_LABELS: Record<ContentRequestRow["status"], string> = {
  draft: "Draft",
  source_review: "Source Review",
  content_development: "In Development",
  approved: "Approved",
};

interface RequestListProps {
  requests: ContentRequestRow[];
  progressByRequest?: Record<string, PipelineProgress>;
  /** The bin: show when each request expires and offer Restore, not Delete. */
  deleted?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

/** Whole days left before a binned request is removed for good. */
function daysLeft(deletedAt: string): number {
  const expiresAt = new Date(deletedAt).getTime() + DELETED_REQUEST_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function RequestList({
  requests,
  progressByRequest = {},
  deleted = false,
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
        const remaining = deleted && request.deleted_at ? daysLeft(request.deleted_at) : null;

        return (
          <div key={request.id} className="flex flex-col gap-3 p-4 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
            <Link href={`/requests/${request.id}`} className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="font-medium">{request.topic}</span>
              <RequestStage progress={progressByRequest[request.id]} />
              <span className="text-xs text-muted-foreground">
                {deleted && request.deleted_at ? (
                  <>
                    Deleted <LocalDateTime value={request.deleted_at} /> ·{" "}
                    {remaining === 0 ? "removed for good today" : `${remaining} day${remaining === 1 ? "" : "s"} left to restore`}
                  </>
                ) : (
                  <>
                    Updated <LocalDateTime value={request.updated_at} />
                  </>
                )}
              </span>
            </Link>

            <div className="flex shrink-0 items-center gap-3">
              <Badge variant="outline">{STATUS_LABELS[request.status]}</Badge>
              {deleted ? <RestoreRequestButton requestId={request.id} /> : <DeleteRequestButton requestId={request.id} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
