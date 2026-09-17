import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listOwnedRequests } from "@/lib/repositories/requests";
import { RequestStatusTabs } from "@/components/dashboard/request-status-tabs";
import { buttonVariants } from "@/components/ui/button";

export default async function DashboardPage() {
  const user = await requireRole("content_manager");
  const supabase = await createSupabaseServerClient();
  const requests = await listOwnedRequests(supabase, user.userId);

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

      <RequestStatusTabs requests={requests} />
    </div>
  );
}
