import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { derivePipelineProgress, type PipelineProgress, type WorkspaceSnapshot } from "@/lib/workspace/next-action";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];

/**
 * Pipeline progress for a whole list of requests, so the dashboard can show
 * the same stage the request's own Overview shows rather than a second,
 * looser guess derived from `status` alone. Status cannot tell Plan from
 * Articles from Channels — all three are `content_development` — which is
 * exactly where a status-only version went wrong.
 *
 * Every lookup here is a single batched query across all the requests, not
 * one per request: the dashboard lists everything a Content Manager owns,
 * and the per-request version of this costs about ten round trips each.
 *
 * `packageReady` is the one field deliberately approximated. Computing it
 * properly means re-running the full readiness checklist per request, and
 * it only ever chooses between "create the package" and "resolve remaining
 * readiness issues" — two actions that live in different stages, so it is
 * resolved just far enough to tell those apart: channels all present and
 * passing is what readiness turns on at that point.
 */
export async function buildDashboardProgress(
  supabase: SupabaseClient<Database>,
  requests: ContentRequestRow[]
): Promise<Record<string, PipelineProgress>> {
  if (requests.length === 0) return {};
  const requestIds = requests.map((r) => r.id);

  const [sourcesResult, plansResult, artifactsResult] = await Promise.all([
    supabase.from("research_sources").select("request_id, retrieval_status").in("request_id", requestIds),
    supabase.from("content_plans").select("request_id").in("request_id", requestIds),
    supabase.from("content_artifacts").select("id, request_id, kind, current_version_id").in("request_id", requestIds),
  ]);

  const artifacts = artifactsResult.data ?? [];
  const versionIds = artifacts.map((a) => a.current_version_id).filter((id): id is string => Boolean(id));

  const { data: evaluations } = versionIds.length
    ? await supabase.from("evaluations").select("artifact_version_id, overall_status").in("artifact_version_id", versionIds)
    : { data: [] };

  const statusByVersion = new Map((evaluations ?? []).map((e) => [e.artifact_version_id, e.overall_status]));
  const planned = new Set((plansResult.data ?? []).map((p) => p.request_id));

  return Object.fromEntries(
    requests.map((request) => {
      const sources = (sourcesResult.data ?? []).filter((s) => s.request_id === request.id);
      const own = artifacts.filter((a) => a.request_id === request.id);
      const articles = own.filter((a) => a.kind === "article");
      const channels = own.filter((a) => a.kind !== "article");

      const evaluationOf = (artifact: (typeof own)[number]) =>
        artifact.current_version_id ? statusByVersion.get(artifact.current_version_id) : undefined;

      const channelsAllPassing =
        channels.length === 3 && channels.every((c) => c.current_version_id && evaluationOf(c) === "pass");

      const snapshot: WorkspaceSnapshot = {
        status: request.status,
        sources: {
          usable: sources.filter((s) => s.retrieval_status === "usable").length,
          pending: sources.filter((s) => s.retrieval_status === "pending").length,
          failed: sources.filter((s) => s.retrieval_status === "failed").length,
          unusable: sources.filter((s) => s.retrieval_status === "unusable").length,
        },
        hasContentPlan: planned.has(request.id),
        articles: {
          total: articles.length,
          anyGenerationFailed: articles.some((a) => !a.current_version_id),
          anyPassingEvaluation: articles.some((a) => evaluationOf(a) === "pass"),
          anyNeedsRevisionOrUnevaluated: articles.length > 0 && !articles.some((a) => evaluationOf(a) === "pass"),
        },
        hasSelectedArticle: Boolean(request.selected_article_version_id),
        channels: {
          total: channels.length,
          anyMissing: channels.length < 3 || channels.some((c) => !c.current_version_id),
          anyNotPassing: channels.some((c) => !c.current_version_id || evaluationOf(c) !== "pass"),
        },
        packageReady: channelsAllPassing,
        hasCurrentPackage: Boolean(request.current_package_id),
      };

      return [request.id, derivePipelineProgress(snapshot)];
    })
  );
}
