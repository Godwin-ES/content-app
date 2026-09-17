import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContentManagerDashboard } from "@/lib/repositories/requests";

interface ActionSummaryProps {
  dashboard: ContentManagerDashboard;
}

const GROUPS: Array<{ key: keyof ContentManagerDashboard; label: string; description: string }> = [
  { key: "needsAttention", label: "Needs Attention", description: "Reviewer asked for changes" },
  { key: "sourceReview", label: "Source Review", description: "Sources ready to review" },
  { key: "awaitingApproval", label: "Awaiting Approval", description: "Submitted, waiting on a reviewer" },
  { key: "approvedReady", label: "Approved / Ready", description: "Ready to queue or schedule" },
];

/**
 * Dashboard hierarchy prioritizing actionable groups over technical status
 * detail (SYSTEM-DESIGN-NEXTJS.md §34.4).
 */
export function ActionSummary({ dashboard }: ActionSummaryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {GROUPS.map((group) => {
        const requests = dashboard[group.key];
        return (
          <Card key={group.key}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">{group.label}</CardTitle>
              <Badge variant={requests.length > 0 ? "default" : "secondary"}>{requests.length}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">{group.description}</p>
              {requests.slice(0, 3).map((request) => (
                <Link
                  key={request.id}
                  href={`/requests/${request.id}`}
                  className="truncate text-sm font-medium underline-offset-4 hover:underline"
                >
                  {request.topic}
                </Link>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
