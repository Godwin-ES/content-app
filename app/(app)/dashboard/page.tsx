import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listOwnedRequests } from "@/lib/repositories/requests";
import { buildDashboardProgress } from "@/lib/workspace/dashboard-progress";
import { RequestStatusTabs } from "@/components/dashboard/request-status-tabs";
import { buttonVariants } from "@/components/ui/button";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();
  const requests = await listOwnedRequests(supabase, user.userId);

  // Only submitted requests can be withdrawn, and only through their own
  // still-pending review.
  const submittedIds = requests.filter((r) => r.status === "pending_approval").map((r) => r.id);
  const { data: pendingReviews } = submittedIds.length
    ? await supabase.from("approval_reviews").select("id, request_id").in("request_id", submittedIds).eq("status", "pending")
    : { data: [] };
  const pendingReviewIdByRequest = Object.fromEntries((pendingReviews ?? []).map((r) => [r.request_id, r.id]));

  const progressByRequest = await buildDashboardProgress(supabase, requests);

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

      <RequestStatusTabs requests={requests} pendingReviewIdByRequest={pendingReviewIdByRequest} progressByRequest={progressByRequest} />
    </div>
  );
}
