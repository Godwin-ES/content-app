import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  source_review: "Source Review",
  content_development: "Content Development",
  pending_approval: "Pending Approval",
  changes_requested: "Changes Requested",
  approved: "Approved",
  archived: "Archived",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  source_review: "secondary",
  content_development: "secondary",
  pending_approval: "default",
  changes_requested: "destructive",
  approved: "default",
  archived: "outline",
};

/**
 * A request's status, always paired with a visible text label — never
 * color alone (SYSTEM-DESIGN-NEXTJS.md §34, accessibility pass Task 19
 * Step 5). Also used for anything else that has a status.
 */
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{STATUS_LABEL[status] ?? status}</Badge>;
}
