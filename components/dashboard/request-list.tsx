import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LocalDateTime } from "@/components/shared/local-date-time";
import { DeleteDraftButton } from "@/components/dashboard/delete-draft-button";
import type { Database } from "@/lib/supabase/database.types";

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

const NEXT_ACTION: Record<ContentRequestRow["status"], string> = {
  draft: "Continue setup",
  source_review: "Review sources",
  content_development: "Continue drafting",
  pending_approval: "Awaiting reviewer",
  changes_requested: "Review requested changes",
  approved: "Queue or schedule",
  archived: "None",
};

interface RequestListProps {
  requests: ContentRequestRow[];
}

export function RequestList({ requests }: RequestListProps) {
  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No requests yet. Start one from the button above.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {requests.map((request) => (
        <div key={request.id} className="flex flex-col gap-1 p-4 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
          <Link href={`/requests/${request.id}`} className="flex flex-1 flex-col gap-1">
            <span className="font-medium">{request.topic}</span>
            <span className="text-xs text-muted-foreground">
              Updated <LocalDateTime value={request.updated_at} />
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Badge variant="outline">{STATUS_LABELS[request.status]}</Badge>
            <span className="text-sm text-muted-foreground">{NEXT_ACTION[request.status]}</span>
            {request.status === "draft" ? <DeleteDraftButton requestId={request.id} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
