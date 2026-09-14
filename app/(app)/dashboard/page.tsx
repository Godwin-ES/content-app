import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getContentManagerDashboard } from "@/lib/repositories/requests";
import { ActionSummary } from "@/components/dashboard/action-summary";
import { RequestList } from "@/components/dashboard/request-list";
import { buttonVariants } from "@/components/ui/button";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();
  const dashboard = await getContentManagerDashboard(supabase, user.userId);

  const allRequests = [
    ...dashboard.needsAttention,
    ...dashboard.sourceReview,
    ...dashboard.awaitingApproval,
    ...dashboard.approvedReady,
    ...dashboard.other,
  ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back, {user.displayName}.</p>
        </div>
        <Link href="/requests/new" className={buttonVariants()}>
          New content request
        </Link>
      </div>

      <ActionSummary dashboard={dashboard} />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">All requests</h2>
        <RequestList requests={allRequests} />
      </div>
    </div>
  );
}
