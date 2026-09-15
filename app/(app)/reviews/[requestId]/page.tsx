import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPackageReview } from "@/lib/approvals/service";
import { ContentPackagePreview } from "@/components/approvals/content-package-preview";
import { ReviewEvidencePanel } from "@/components/approvals/review-evidence-panel";
import { ReviewDecisionPanel } from "@/components/approvals/review-decision-panel";
import { Badge } from "@/components/ui/badge";

/**
 * Exact read-only review page (SYSTEM-DESIGN-NEXTJS.md §24, §34.9): header
 * explicitly names the exact package version under review. Main pane
 * prioritizes the article/channel outputs (reusing the same
 * ContentPackagePreview a Content Manager sees before submitting); the
 * evidence panel stays secondary.
 */
export default async function PackageReviewPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const user = await requireCurrentUser();
  if (user.role !== "reviewer") notFound();

  const supabase = await createSupabaseServerClient();
  const context = await getPackageReview(supabase, requestId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reviewing Package v{context.package.version_number}</h1>
          <p className="text-sm text-muted-foreground">{context.request.topic} · Exact submitted version</p>
        </div>
        <Badge variant="outline">{context.review.status}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ContentPackagePreview contentPackage={context.package} />
        <ReviewEvidencePanel context={context} />
      </div>

      <ReviewDecisionPanel reviewId={context.review.id} packageId={context.package.id} isPending={context.review.status === "pending"} />
    </div>
  );
}
