import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getContentRequest } from "@/lib/repositories/requests";
import { listResearchSources, listSourceEvidence, getLatestSourceDecision, listSourceConflicts } from "@/lib/repositories/sources";
import { listContentArtifacts, listArtifactVersions } from "@/lib/repositories/content";
import { listContentPlanVersions } from "@/lib/planning/service";
import { getLatestEvaluation } from "@/lib/repositories/evaluations";
import { getPackageReadiness } from "@/lib/packages/service";
import { getLatestReview } from "@/lib/repositories/approvals";
import { getPublishingQueue } from "@/lib/publishing/service";
import { listActivityEvents } from "@/lib/repositories/activity";
import { deriveNextAction, type WorkspaceSnapshot } from "@/lib/workspace/next-action";

import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RequestStepper } from "@/components/requests/request-stepper";
import { RequestWorkspace } from "@/components/requests/request-workspace";
import { ResearchTab } from "@/components/research/research-tab";
import { PlanTab } from "@/components/articles/plan-tab";
import { ArticleComparison } from "@/components/articles/article-comparison";
import { ChannelWorkspace } from "@/components/channels/channel-workspace";
import { PackageReadiness } from "@/components/approvals/package-readiness";
import { ContentPackagePreview } from "@/components/approvals/content-package-preview";
import { SubmissionPanel } from "@/components/approvals/submission-panel";
import { QueueControls } from "@/components/publishing/queue-controls";
import { PublishingList } from "@/components/publishing/publishing-list";
import { ActivityTimeline } from "@/components/activity/activity-timeline";

/**
 * Request workspace (SYSTEM-DESIGN-NEXTJS.md §34.3): Overview / Research /
 * Articles / Channels / Approval / Publishing / Activity tabs, a single
 * derived next-action stepper, and explicit empty states rather than a
 * flat page of conditionally-appearing sections.
 */
export default async function RequestWorkspacePage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  await requireCurrentUser();
  const supabase = await createSupabaseServerClient();
  const request = await getContentRequest(supabase, requestId);

  if (!request) notFound();

  const [sources, activityEvents] = await Promise.all([
    listResearchSources(supabase, requestId),
    listActivityEvents(supabase, requestId),
  ]);

  const sourceCounts = {
    usable: sources.filter((s) => s.retrieval_status === "usable").length,
    pending: sources.filter((s) => s.retrieval_status === "pending").length,
    failed: sources.filter((s) => s.retrieval_status === "failed").length,
    unusable: sources.filter((s) => s.retrieval_status === "unusable").length,
  };

  const [evidenceEntries, decisionEntries, conflicts] = await Promise.all([
    Promise.all(sources.map(async (s) => [s.id, await listSourceEvidence(supabase, s.id)] as const)),
    Promise.all(sources.map(async (s) => [s.id, await getLatestSourceDecision(supabase, s.id)] as const)),
    listSourceConflicts(supabase, requestId),
  ]);
  const evidenceBySource = Object.fromEntries(evidenceEntries);
  const decisionsBySource = Object.fromEntries(decisionEntries);

  const planVersions = await listContentPlanVersions(supabase, requestId);
  const plan = planVersions[0] ?? null;

  const artifacts = await listContentArtifacts(supabase, requestId);
  const articleArtifacts = artifacts.filter((a) => a.kind === "article");
  const channelArtifacts = artifacts.filter((a) => a.kind !== "article");

  const articleVersionEntries = await Promise.all(
    articleArtifacts.map(async (a) => {
      if (!a.current_version_id) return [a.id, null] as const;
      const { data } = await supabase.from("artifact_versions").select().eq("id", a.current_version_id).single();
      return [a.id, data ?? null] as const;
    })
  );
  const articleVersionsByArtifact = Object.fromEntries(articleVersionEntries);
  const articleEvaluationEntries = await Promise.all(
    articleArtifacts.map(async (a) => {
      const version = articleVersionsByArtifact[a.id];
      if (!version) return [a.id, null] as const;
      return [a.id, await getLatestEvaluation(supabase, version.id)] as const;
    })
  );
  const articleEvaluationsByArtifact = Object.fromEntries(articleEvaluationEntries);
  const articleAllVersionsEntries = await Promise.all(
    articleArtifacts.map(async (a) => [a.id, await listArtifactVersions(supabase, a.id)] as const)
  );

  const channelVersionEntries = await Promise.all(
    channelArtifacts.map(async (a) => {
      if (!a.current_version_id) return [a.id, null] as const;
      const { data } = await supabase.from("artifact_versions").select().eq("id", a.current_version_id).single();
      return [a.id, data ?? null] as const;
    })
  );
  const channelVersionsByArtifact = Object.fromEntries(channelVersionEntries);
  const channelEvaluationEntries = await Promise.all(
    channelArtifacts.map(async (a) => {
      const version = channelVersionsByArtifact[a.id];
      if (!version) return [a.id, null] as const;
      return [a.id, await getLatestEvaluation(supabase, version.id)] as const;
    })
  );
  const channelEvaluationsByArtifact = Object.fromEntries(channelEvaluationEntries);
  const channelAllVersionsEntries = await Promise.all(
    channelArtifacts.map(async (a) => [a.id, await listArtifactVersions(supabase, a.id)] as const)
  );

  let currentPackage = null;
  if (request.current_package_id) {
    const { data } = await supabase.from("content_packages").select().eq("id", request.current_package_id).maybeSingle();
    currentPackage = data ?? null;
  }

  const readiness = request.selected_article_version_id ? await getPackageReadiness(supabase, requestId) : null;
  const latestReview = request.status === "pending_approval" ? await getLatestReview(supabase, requestId) : null;
  const queue = request.current_package_id ? await getPublishingQueue(supabase, requestId) : null;

  const snapshot: WorkspaceSnapshot = {
    status: request.status,
    sources: sourceCounts,
    hasContentPlan: Boolean(plan),
    articles: {
      total: articleArtifacts.length,
      anyGenerationFailed: articleArtifacts.some((a) => !a.current_version_id),
      anyPassingEvaluation: Object.values(articleEvaluationsByArtifact).some((e) => e?.overall_status === "pass"),
      anyNeedsRevisionOrUnevaluated:
        articleArtifacts.length > 0 && !Object.values(articleEvaluationsByArtifact).some((e) => e?.overall_status === "pass"),
    },
    hasSelectedArticle: Boolean(request.selected_article_version_id),
    channels: {
      total: channelArtifacts.length,
      anyMissing: channelArtifacts.length < 3 || channelArtifacts.some((a) => !a.current_version_id),
      anyNotPassing: channelArtifacts.some((a) => {
        const evaluation = channelEvaluationsByArtifact[a.id];
        return !a.current_version_id || evaluation?.overall_status !== "pass";
      }),
    },
    packageReady: readiness?.ready ?? false,
    hasCurrentPackage: Boolean(request.current_package_id),
    hasActiveQueueItems: queue ? queue.entries.some((e) => e.item.status !== "cancelled") : false,
  };
  const nextAction = deriveNextAction(snapshot);

  const overviewContent = (
    <>
      <RequestStepper nextAction={nextAction} />
      <div className="grid gap-3 sm:grid-cols-2">
        <EmptyState
          title="Sources"
          description={`${sourceCounts.usable} usable, ${sourceCounts.pending} pending, ${sourceCounts.failed + sourceCounts.unusable} unusable/failed.`}
        />
        <EmptyState
          title="Content plan"
          description={plan ? `Version ${plan.version_number}: ${plan.title}` : "No content plan yet."}
        />
        <EmptyState
          title="Articles"
          description={
            articleArtifacts.length === 0
              ? "No article options generated yet."
              : `${articleArtifacts.length} option(s), ${request.selected_article_version_id ? "one selected" : "none selected yet"}.`
          }
        />
        <EmptyState
          title="Channels"
          description={channelArtifacts.length === 0 ? "No channel assets generated yet." : `${channelArtifacts.length} of 3 channels generated.`}
        />
      </div>
    </>
  );

  const researchContent = (
    <ResearchTab
      requestId={requestId}
      status={request.status}
      sources={sources}
      evidenceBySource={evidenceBySource}
      decisionsBySource={decisionsBySource}
      conflicts={conflicts}
      suppliedSourcesOnly={request.supplied_sources_only}
    />
  );

  const planContent = <PlanTab requestId={requestId} plan={plan} versions={planVersions} canGenerate={request.status === "content_development"} />;

  const articlesContent = (
    <>
      {plan ? (
        <ArticleComparison
          requestId={requestId}
          articleArtifacts={articleArtifacts}
          currentVersionsByArtifact={articleVersionsByArtifact}
          evaluationsByArtifact={articleEvaluationsByArtifact}
          versionsByArtifact={Object.fromEntries(articleAllVersionsEntries)}
          selectedArticleVersionId={request.selected_article_version_id}
          canGenerate={request.status === "content_development"}
        />
      ) : (
        <EmptyState title="No content plan yet" description="Generate a content plan in the Plan tab before writing article options." />
      )}
    </>
  );

  const channelsContent = request.selected_article_version_id ? (
    <ChannelWorkspace
      requestId={requestId}
      channelArtifacts={channelArtifacts}
      currentVersionsByArtifact={channelVersionsByArtifact}
      evaluationsByArtifact={channelEvaluationsByArtifact}
      versionsByArtifact={Object.fromEntries(channelAllVersionsEntries)}
      canGenerate={request.status === "content_development"}
    />
  ) : (
    <EmptyState title="Select an article first" description="Channel adaptation works from the selected article option." />
  );

  const approvalContent = request.selected_article_version_id ? (
    <>
      {readiness ? (
        <PackageReadiness
          requestId={requestId}
          readiness={readiness}
          canCreate={request.status === "content_development" || request.status === "changes_requested"}
        />
      ) : null}
      {currentPackage ? <ContentPackagePreview contentPackage={currentPackage} /> : null}
      <SubmissionPanel
        requestId={requestId}
        requestStatus={request.status}
        hasCurrentPackage={Boolean(request.current_package_id)}
        pendingReviewId={latestReview?.id ?? null}
      />
      {currentPackage ? (
        <a href={`/requests/${requestId}/sample-pack`} className="w-fit text-sm underline" target="_blank" rel="noreferrer">
          Open printable sample pack
        </a>
      ) : null}
    </>
  ) : (
    <EmptyState title="Not ready for approval yet" description="Select an article and generate channel assets first." />
  );

  const publishingContent = queue ? (
    <>
      {request.status === "approved" ? <QueueControls requestId={requestId} queueableChannels={queue.queueableChannels} /> : null}
      <PublishingList entries={queue.entries} />
    </>
  ) : (
    <EmptyState title="No approved package yet" description="Publishing becomes available once a package is approved." />
  );

  const activityContent = <ActivityTimeline events={activityEvents} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{request.topic}</h1>
        <StatusBadge status={request.status} />
      </div>

      <RequestWorkspace
        overview={overviewContent}
        research={researchContent}
        plan={planContent}
        articles={articlesContent}
        channels={channelsContent}
        approval={approvalContent}
        publishing={publishingContent}
        activity={activityContent}
      />
    </div>
  );
}
