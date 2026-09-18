import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getContentRequest } from "@/lib/repositories/requests";
import { listResearchSources, listSourceEvidence, getLatestSourceDecision, listSourceConflicts } from "@/lib/repositories/sources";
import { listContentArtifacts, listArtifactVersions } from "@/lib/repositories/content";
import { listContentPlanVersions } from "@/lib/planning/service";
import { getLatestEvaluation } from "@/lib/repositories/evaluations";
import { getPackageReadiness } from "@/lib/packages/service";
import { getSamplePack } from "@/lib/sample-pack/service";
import { getPublishingQueue } from "@/lib/publishing/service";
import { listActivityEvents } from "@/lib/repositories/activity";
import { filterDisplayedActivity } from "@/lib/activity/display";
import { assessKeywordCoverage } from "@/lib/research/keyword-coverage";
import { researchRunAvailability } from "@/lib/research/service";
import { deriveNextAction, derivePipelineProgress } from "@/lib/workspace/next-action";
import { buildWorkspaceSnapshot } from "@/lib/workspace/snapshot";
import { articlesStaleAgainstPlan, channelsStaleAgainstArticle } from "@/lib/workspace/staleness";

import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RequestStepper } from "@/components/requests/request-stepper";
import { RequestWorkspace } from "@/components/requests/request-workspace";
import { parseWorkspaceTab } from "@/lib/workspace/tabs";
import { ResearchTab } from "@/components/research/research-tab";
import { PlanTab } from "@/components/articles/plan-tab";
import { ArticleComparison } from "@/components/articles/article-comparison";
import { ChannelWorkspace } from "@/components/channels/channel-workspace";
import { PackageReadiness } from "@/components/approvals/package-readiness";
import { ContentPackagePreview } from "@/components/approvals/content-package-preview";
import { SamplePackView } from "@/components/requests/sample-pack-view";
import { ApprovalPanel } from "@/components/approvals/approval-panel";
import { QueueControls } from "@/components/publishing/queue-controls";
import { PublishingList } from "@/components/publishing/publishing-list";
import { ActivityHistory } from "@/components/activity/activity-history";
import { StaleNotice } from "@/components/shared/stale-notice";
import { AutoModePanel } from "@/components/requests/auto-mode-panel";
import { RestoreRequestButton } from "@/components/dashboard/restore-request-button";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Request workspace (SYSTEM-DESIGN-NEXTJS.md §34.3): Overview / Research /
 * Articles / Channels / Package / Publishing / Activity tabs, a single
 * derived next-action stepper, and explicit empty states rather than a
 * flat page of conditionally-appearing sections.
 */
export default async function RequestWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { requestId } = await params;
  const { tab } = await searchParams;
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

  // Computed from the sources and decisions already loaded above rather
  // than through assessRequestKeywordCoverage, which would re-fetch every
  // source's extracted text a second time on every page load. Same pure
  // function underneath, so the banner and the confirm gate cannot
  // disagree.
  const anyDecision = Object.values(decisionsBySource).some((d) => d !== null);
  const coverageSources = sources
    .filter((s) => s.retrieval_status === "usable")
    .filter((s) => !anyDecision || decisionsBySource[s.id] === "accepted");
  const keywordCoverage = assessKeywordCoverage(
    request.resolved_primary_keyword,
    coverageSources.map((s) => ({ id: s.id, title: s.title, extractedText: s.extracted_text, origin: s.origin as "researched" | "user_url" | "uploaded_material" }))
  );

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
  const queue = request.current_package_id ? await getPublishingQueue(supabase, requestId) : null;
  // The Package tab shows the assembled pack in place, so what gets
  // approved is what the approver actually reads. Assembling it dereferences
  // the package's pinned version and evaluation rows; if any of those cannot
  // be read, the tab degrades to the readiness and submission panels rather
  // than taking the whole workspace down with it.
  let samplePack = null;
  if (request.current_package_id) {
    try {
      samplePack = await getSamplePack(supabase, requestId);
    } catch {
      samplePack = null;
    }
  }

  // Built through the shared helper so this page, the dashboard, and auto
  // mode all describe the same request identically.
  const snapshot = buildWorkspaceSnapshot({
    request,
    sources,
    hasContentPlan: Boolean(plan),
    articleArtifacts,
    articleEvaluations: articleEvaluationsByArtifact,
    channelArtifacts,
    channelEvaluations: channelEvaluationsByArtifact,
    packageReady: readiness?.ready ?? false,
    hasActiveQueueItems: queue ? queue.entries.some((e) => e.item.status !== "cancelled") : false,
  });
  const nextAction = deriveNextAction(snapshot);

  // Request-level settings (primary keyword, CTA) stay editable right up to
  // approval; once a package is approved, what it was written to target is
  // part of what was approved. The RPCs enforce the same rule, so this only
  // decides whether to offer the control.
  const canEditSettings = ["draft", "source_review", "content_development"].includes(request.status);

  const overviewContent = (
    <>
      <RequestStepper nextAction={nextAction} />
      <AutoModePanel
        requestId={requestId}
        canRun={request.status === "draft" || request.status === "source_review" || request.status === "content_development"}
        currentStage={derivePipelineProgress(snapshot).stage}
      />
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
      <ActivityHistory events={filterDisplayedActivity(activityEvents)} />
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
      primaryKeyword={request.resolved_primary_keyword}
      canEditSettings={canEditSettings}
      keywordCoverage={keywordCoverage}
      runAvailability={researchRunAvailability(request)}
    />
  );

  const planContent = <PlanTab requestId={requestId} plan={plan} versions={planVersions} canGenerate={request.status === "content_development"} />;

  const articlesStale = articlesStaleAgainstPlan(Object.values(articleVersionsByArtifact), plan?.id ?? null);
  const channelsStale = channelsStaleAgainstArticle(Object.values(channelVersionsByArtifact), request.selected_article_version_id);

  const articlesContent = (
    <>
      <StaleNotice notice={articlesStale} />
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
    <>
      <StaleNotice notice={channelsStale} />
      <ChannelWorkspace
      requestId={requestId}
      channelArtifacts={channelArtifacts}
      currentVersionsByArtifact={channelVersionsByArtifact}
      evaluationsByArtifact={channelEvaluationsByArtifact}
      versionsByArtifact={Object.fromEntries(channelAllVersionsEntries)}
      canGenerate={request.status === "content_development"}
      cta={request.resolved_cta}
      canEditSettings={canEditSettings}
      />
    </>
  ) : (
    <EmptyState title="Select an article first" description="Channel adaptation works from the selected article option." />
  );

  const packageContent = request.selected_article_version_id ? (
    <>
      {readiness ? (
        <PackageReadiness
          requestId={requestId}
          readiness={readiness}
          canCreate={request.status === "content_development"}
        />
      ) : null}
      {/* The assembled pack below is the package preview, in full and with
          its evaluations. ContentPackagePreview is the fallback for the one
          case the pack cannot cover: a package whose pinned version or
          evaluation rows could not be read, where showing the snapshot the
          package carries is better than showing nothing. */}
      {currentPackage && !samplePack ? <ContentPackagePreview contentPackage={currentPackage} /> : null}
      <ApprovalPanel requestId={requestId} requestStatus={request.status} hasCurrentPackage={Boolean(request.current_package_id)} />
      {samplePack ? (
        <>
          <SamplePackView pack={samplePack} interactive />
          <a href={`/requests/${requestId}/sample-pack`} className="w-fit text-sm underline" target="_blank" rel="noreferrer">
            Open printable version
          </a>
        </>
      ) : null}
    </>
  ) : (
    <EmptyState title="No package yet" description="Select an article and generate channel assets first." />
  );

  const publishingContent = queue ? (
    <>
      {request.status === "approved" ? <QueueControls requestId={requestId} queueableChannels={queue.queueableChannels} /> : null}
      <PublishingList entries={queue.entries} />
    </>
  ) : (
    <EmptyState title="No approved package yet" description="Publishing becomes available once a package is approved." />
  );


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{request.topic}</h1>
        <StatusBadge status={request.status} />
      </div>

      {/* Reachable by a link or a back button after the request was binned.
          Showing the workspace read-only with a way out beats a 404 on
          something the owner can still get back. */}
      {request.deleted_at ? (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>This request is in the bin. Restore it to make any further changes.</span>
            <RestoreRequestButton requestId={requestId} />
          </AlertDescription>
        </Alert>
      ) : null}

      <RequestWorkspace
        overview={overviewContent}
        research={researchContent}
        plan={planContent}
        articles={articlesContent}
        channels={channelsContent}
        packageTab={packageContent}
        defaultTab={parseWorkspaceTab(tab)}
        publishing={publishingContent}
      />
    </div>
  );
}
