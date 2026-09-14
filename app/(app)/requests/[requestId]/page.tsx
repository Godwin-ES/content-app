import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getContentRequest } from "@/lib/repositories/requests";
import { listSupportingMaterials } from "@/lib/repositories/materials";
import { listResearchSources, listSourceEvidence, getLatestSourceDecision, listSourceConflicts } from "@/lib/repositories/sources";
import { Badge } from "@/components/ui/badge";
import { SupportingMaterialUpload } from "@/components/requests/supporting-material-upload";
import { ResearchProgress } from "@/components/research/research-progress";
import { ResearchFailureList } from "@/components/research/research-failure-list";
import { SourceReviewWorkspace } from "@/components/research/source-review-workspace";
import { ContentPlanEditor } from "@/components/articles/content-plan-editor";
import { ArticleComparison } from "@/components/articles/article-comparison";
import { listContentArtifacts } from "@/lib/repositories/content";

/**
 * Minimal placeholder for the request workspace. Task 19 replaces this with
 * the full Overview/Research/Articles/Channels/Approval/Publishing/Activity
 * workspace; this stands in now so the intake flow (Task 5) has somewhere to
 * land instead of a dead link.
 */
export default async function RequestWorkspacePage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  await requireCurrentUser();
  const supabase = await createSupabaseServerClient();
  const request = await getContentRequest(supabase, requestId);

  if (!request) notFound();

  const materials = await listSupportingMaterials(supabase, requestId);
  const sources = await listResearchSources(supabase, requestId);

  let sourceReviewSection = null;
  if (request.status === "source_review") {
    const [evidenceEntries, decisionEntries, conflicts] = await Promise.all([
      Promise.all(sources.map(async (s) => [s.id, await listSourceEvidence(supabase, s.id)] as const)),
      Promise.all(sources.map(async (s) => [s.id, await getLatestSourceDecision(supabase, s.id)] as const)),
      listSourceConflicts(supabase, requestId),
    ]);
    sourceReviewSection = (
      <SourceReviewWorkspace
        requestId={requestId}
        sources={sources}
        evidenceBySource={Object.fromEntries(evidenceEntries)}
        decisionsBySource={Object.fromEntries(decisionEntries)}
        conflicts={conflicts}
      />
    );
  }

  let contentPlanSection = null;
  if (request.status === "content_development" || request.current_plan_id) {
    const { data: plan } = await supabase
      .from("content_plans")
      .select()
      .eq("request_id", requestId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    contentPlanSection = (
      <ContentPlanEditor requestId={requestId} plan={plan} canGenerate={request.status === "content_development"} />
    );
  }

  let articleSection = null;
  if (request.current_plan_id) {
    const artifacts = await listContentArtifacts(supabase, requestId);
    const articleArtifacts = artifacts.filter((a) => a.kind === "article");
    const versionEntries = await Promise.all(
      articleArtifacts.map(async (a) => {
        if (!a.current_version_id) return [a.id, null] as const;
        const { data } = await supabase.from("artifact_versions").select().eq("id", a.current_version_id).single();
        return [a.id, data ?? null] as const;
      })
    );
    articleSection = (
      <ArticleComparison
        requestId={requestId}
        articleArtifacts={articleArtifacts}
        currentVersionsByArtifact={Object.fromEntries(versionEntries)}
        canGenerate={request.status === "content_development"}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{request.topic}</h1>
        <Badge variant="outline">{request.status}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        The full research and review workspace for this request is under construction.
      </p>
      <SupportingMaterialUpload requestId={requestId} initialMaterials={materials} />
      <ResearchProgress requestId={requestId} status={request.status} />
      {sourceReviewSection ?? <ResearchFailureList sources={sources} />}
      {contentPlanSection}
      {articleSection}
    </div>
  );
}
