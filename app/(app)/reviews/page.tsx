import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getReviewerQueue } from "@/lib/approvals/service";
import { ReviewQueue } from "@/components/approvals/review-queue";

export default async function ReviewsPage() {
  const user = await requireCurrentUser();
  if (user.role !== "reviewer") notFound();

  const supabase = await createSupabaseServerClient();
  const queue = await getReviewerQueue(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Reviewer Queue</h1>
        <p className="text-sm text-muted-foreground">Independent review and approval of submitted content packages.</p>
      </div>
      <ReviewQueue queue={queue} />
    </div>
  );
}
