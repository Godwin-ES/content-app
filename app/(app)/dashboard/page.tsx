import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listOwnedRequests, listDeletedRequests } from "@/lib/repositories/requests";
import { buildDashboardProgress } from "@/lib/workspace/dashboard-progress";
import { RequestStatusTabs } from "@/components/dashboard/request-status-tabs";
import { buttonVariants } from "@/components/ui/button";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();

  const [requests, deletedRequests] = await Promise.all([
    listOwnedRequests(supabase, user.userId),
    listDeletedRequests(supabase, user.userId),
  ]);

  // Only live requests get a stage: a binned one is not making progress
  // towards anything until it is restored.
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

      <RequestStatusTabs requests={requests} deletedRequests={deletedRequests} progressByRequest={progressByRequest} />
    </div>
  );
}
