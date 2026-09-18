import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { listResearchSources, getLatestSourceDecision } from "@/lib/repositories/sources";
import { listContentArtifacts } from "@/lib/repositories/content";
import { getLatestEvaluation } from "@/lib/repositories/evaluations";
import { getPackageReadiness } from "@/lib/packages/service";
import { getPublishingQueue } from "@/lib/publishing/service";
import type { WorkspaceSnapshot } from "@/lib/workspace/next-action";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type ContentArtifactRow = Database["public"]["Tables"]["content_artifacts"]["Row"];
type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];
type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];

/**
 * Builds the snapshot `deriveNextAction` reads, from data the caller has
 * already loaded. Pure, so the request page (which holds all of this for
 * rendering anyway) and the auto-mode driver (which fetches its own) cannot
 * end up describing the same request differently — the page and the
 * dashboard had already drifted once, which is what let a draft disappear.
 */
export function buildWorkspaceSnapshot(parts: {
  request: ContentRequestRow;
  sources: ResearchSourceRow[];
  hasContentPlan: boolean;
  articleArtifacts: ContentArtifactRow[];
  articleEvaluations: Record<string, EvaluationRow | null>;
  channelArtifacts: ContentArtifactRow[];
  channelEvaluations: Record<string, EvaluationRow | null>;
  packageReady: boolean;
  hasActiveQueueItems: boolean;
}): WorkspaceSnapshot {
  const { request, sources, articleArtifacts, articleEvaluations, channelArtifacts, channelEvaluations } = parts;

  return {
    status: request.status,
    sources: {
      usable: sources.filter((s) => s.retrieval_status === "usable").length,
      pending: sources.filter((s) => s.retrieval_status === "pending").length,
      failed: sources.filter((s) => s.retrieval_status === "failed").length,
      unusable: sources.filter((s) => s.retrieval_status === "unusable").length,
    },
    hasContentPlan: parts.hasContentPlan,
    articles: {
      total: articleArtifacts.length,
      anyGenerationFailed: articleArtifacts.some((a) => !a.current_version_id),
      anyPassingEvaluation: Object.values(articleEvaluations).some((e) => e?.overall_status === "pass"),
      anyNeedsRevisionOrUnevaluated:
        articleArtifacts.length > 0 && !Object.values(articleEvaluations).some((e) => e?.overall_status === "pass"),
    },
    hasSelectedArticle: Boolean(request.selected_article_version_id),
    channels: {
      total: channelArtifacts.length,
      anyMissing: channelArtifacts.length < 3 || channelArtifacts.some((a) => !a.current_version_id),
      anyNotPassing: channelArtifacts.some((a) => {
        const evaluation = channelEvaluations[a.id];
        return !a.current_version_id || evaluation?.overall_status !== "pass";
      }),
    },
    packageReady: parts.packageReady,
    hasCurrentPackage: Boolean(request.current_package_id),
    hasActiveQueueItems: parts.hasActiveQueueItems,
  };
}

export interface LoadedWorkspace {
  request: ContentRequestRow;
  /** The latest decision on each source, so auto mode can leave yours alone. */
  sourceDecisions: Record<string, "accepted" | "excluded" | null>;
  snapshot: WorkspaceSnapshot;
  articleArtifacts: ContentArtifactRow[];
  articleEvaluations: Record<string, EvaluationRow | null>;
  channelArtifacts: ContentArtifactRow[];
  channelEvaluations: Record<string, EvaluationRow | null>;
  sources: ResearchSourceRow[];
}

/** Loads everything `buildWorkspaceSnapshot` needs for one request. */
export async function loadWorkspace(supabase: SupabaseClient<Database>, requestId: string): Promise<LoadedWorkspace> {
  const { data: request, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !request) throw error ?? new Error("Request not found");

  const [sources, artifacts, plans] = await Promise.all([
    listResearchSources(supabase, requestId),
    listContentArtifacts(supabase, requestId),
    supabase.from("content_plans").select("id").eq("request_id", requestId).limit(1),
  ]);

  const articleArtifacts = artifacts.filter((a) => a.kind === "article");
  const channelArtifacts = artifacts.filter((a) => a.kind !== "article");

  const evaluationsFor = async (list: ContentArtifactRow[]) =>
    Object.fromEntries(
      await Promise.all(
        list.map(async (a) => [a.id, a.current_version_id ? await getLatestEvaluation(supabase, a.current_version_id) : null] as const)
      )
    );

  const [articleEvaluations, channelEvaluations] = await Promise.all([
    evaluationsFor(articleArtifacts),
    evaluationsFor(channelArtifacts),
  ]);

  const readiness = request.selected_article_version_id ? await getPackageReadiness(supabase, requestId) : null;
  const queue = request.current_package_id ? await getPublishingQueue(supabase, requestId) : null;

  const sourceDecisions = Object.fromEntries(
    await Promise.all(sources.map(async (s) => [s.id, await getLatestSourceDecision(supabase, s.id)] as const))
  );

  return {
    request,
    sourceDecisions,
    articleArtifacts,
    articleEvaluations,
    channelArtifacts,
    channelEvaluations,
    sources,
    snapshot: buildWorkspaceSnapshot({
      request,
      sources,
      hasContentPlan: (plans.data ?? []).length > 0,
      articleArtifacts,
      articleEvaluations,
      channelArtifacts,
      channelEvaluations,
      packageReady: readiness?.ready ?? false,
      hasActiveQueueItems: queue ? queue.entries.some((e) => e.item.status !== "cancelled") : false,
    }),
  };
}
