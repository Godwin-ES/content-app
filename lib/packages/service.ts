import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { hashCanonicalJson } from "@/lib/domain/hashing";
import { assertContentEditable } from "@/lib/domain/request-guards";
import { getLatestEvaluation } from "@/lib/repositories/evaluations";
import { listSourceConflicts } from "@/lib/repositories/sources";
import { throwFromRpcError } from "@/lib/supabase/rpc";
import type { ArticleOutput } from "@/lib/ai/schemas/article";
import type { LinkedinPost, XPost, Newsletter } from "@/lib/ai/schemas/channel";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type ContentArtifactRow = Database["public"]["Tables"]["content_artifacts"]["Row"];
type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];
type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];
type ContentPackageRow = Database["public"]["Tables"]["content_packages"]["Row"];
type ChannelKind = "linkedin" | "x" | "newsletter";

const CHANNEL_KINDS: ChannelKind[] = ["linkedin", "x", "newsletter"];
const CHANNEL_LABEL: Record<ChannelKind, string> = { linkedin: "LinkedIn", x: "X", newsletter: "Newsletter" };

export interface PackageReadinessCheck {
  key: string;
  ok: boolean;
  message: string;
}

export interface PackageReadiness {
  ready: boolean;
  checks: PackageReadinessCheck[];
}

export interface PackageCandidate {
  request: ContentRequestRow;
  articleArtifact: ContentArtifactRow | null;
  articleVersion: ArtifactVersionRow | null;
  articleEvaluation: EvaluationRow | null;
  channelArtifacts: Record<ChannelKind, ContentArtifactRow | null>;
  channelVersions: Record<ChannelKind, ArtifactVersionRow | null>;
  channelEvaluations: Record<ChannelKind, EvaluationRow | null>;
  unresolvedConflictCount: number;
}

async function loadPackageCandidate(supabase: SupabaseClient<Database>, requestId: string): Promise<PackageCandidate> {
  const { data: request, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !request) throw error ?? new DomainError("NOT_FOUND", "package_readiness", "Request not found.");

  let articleArtifact: ContentArtifactRow | null = null;
  let articleVersion: ArtifactVersionRow | null = null;
  let articleEvaluation: EvaluationRow | null = null;
  if (request.selected_article_version_id) {
    const { data: version } = await supabase
      .from("artifact_versions")
      .select()
      .eq("id", request.selected_article_version_id)
      .maybeSingle();
    articleVersion = version ?? null;
    if (articleVersion) {
      const { data: artifact } = await supabase.from("content_artifacts").select().eq("id", articleVersion.artifact_id).maybeSingle();
      articleArtifact = artifact ?? null;
      articleEvaluation = await getLatestEvaluation(supabase, articleVersion.id);
    }
  }

  const { data: artifacts } = await supabase.from("content_artifacts").select().eq("request_id", requestId).in("kind", CHANNEL_KINDS);
  const channelArtifacts = {} as Record<ChannelKind, ContentArtifactRow | null>;
  const channelVersions = {} as Record<ChannelKind, ArtifactVersionRow | null>;
  const channelEvaluations = {} as Record<ChannelKind, EvaluationRow | null>;

  for (const kind of CHANNEL_KINDS) {
    const artifact = (artifacts ?? []).find((a) => a.kind === kind) ?? null;
    channelArtifacts[kind] = artifact;
    if (artifact?.current_version_id) {
      const { data: version } = await supabase.from("artifact_versions").select().eq("id", artifact.current_version_id).maybeSingle();
      channelVersions[kind] = version ?? null;
      channelEvaluations[kind] = version ? await getLatestEvaluation(supabase, version.id) : null;
    } else {
      channelVersions[kind] = null;
      channelEvaluations[kind] = null;
    }
  }

  const conflicts = await listSourceConflicts(supabase, requestId);
  const unresolvedConflictCount = conflicts.filter((c) => c.resolution === null).length;

  return { request, articleArtifact, articleVersion, articleEvaluation, channelArtifacts, channelVersions, channelEvaluations, unresolvedConflictCount };
}

/**
 * Pure readiness calculation (SYSTEM-DESIGN-NEXTJS.md §23): package
 * creation requires the *exact current* article and channel revisions,
 * each with a passing current evaluation, generated from the request's
 * currently confirmed source set, with no unresolved grounding conflict.
 * The UI must be able to explain exactly which condition is missing
 * rather than just disabling a button.
 */
export function computeReadinessChecks(candidate: PackageCandidate): PackageReadinessCheck[] {
  const checks: PackageReadinessCheck[] = [];

  const articleSelected = candidate.request.selected_article_version_id !== null && candidate.articleVersion !== null;
  checks.push({
    key: "article_selected",
    ok: articleSelected,
    message: articleSelected ? "An article option has been selected." : "No article option has been selected yet.",
  });

  const articleIsCurrent = Boolean(
    candidate.articleArtifact && candidate.articleVersion && candidate.articleArtifact.current_version_id === candidate.articleVersion.id
  );
  checks.push({
    key: "article_is_current",
    ok: articleIsCurrent,
    message: articleIsCurrent
      ? "The selected article is its option's current revision."
      : "The selected article has since been superseded by a newer revision; reselect the current one.",
  });

  const articlePassing = candidate.articleEvaluation?.overall_status === "pass";
  checks.push({
    key: "article_evaluation_passing",
    ok: articlePassing,
    message: articlePassing ? "The selected article has a passing evaluation." : "The selected article does not have a passing current evaluation.",
  });

  for (const kind of CHANNEL_KINDS) {
    const hasVersion = candidate.channelVersions[kind] !== null;
    checks.push({
      key: `${kind}_current_version`,
      ok: hasVersion,
      message: hasVersion
        ? `${CHANNEL_LABEL[kind]} has a current version.`
        : `${CHANNEL_LABEL[kind]} has no generated version yet.`,
    });

    const evaluationPassing = candidate.channelEvaluations[kind]?.overall_status === "pass";
    checks.push({
      key: `${kind}_evaluation_passing`,
      ok: evaluationPassing,
      message: evaluationPassing
        ? `${CHANNEL_LABEL[kind]} has a passing evaluation.`
        : `${CHANNEL_LABEL[kind]} does not have a passing current evaluation.`,
    });
  }

  const sourceSetCurrent = Boolean(
    candidate.articleVersion && candidate.articleVersion.source_set_version_id === candidate.request.current_source_set_id
  );
  checks.push({
    key: "source_set_current",
    ok: sourceSetCurrent,
    message: sourceSetCurrent
      ? "The article was generated from the currently confirmed source set."
      : "The confirmed source set has changed since the article was generated.",
  });

  const noUnresolvedConflicts = candidate.unresolvedConflictCount === 0;
  checks.push({
    key: "no_unresolved_conflicts",
    ok: noUnresolvedConflicts,
    message: noUnresolvedConflicts
      ? "No unresolved source conflicts."
      : `${candidate.unresolvedConflictCount} unresolved source conflict(s) must be resolved first.`,
  });

  return checks;
}

export async function getPackageReadiness(supabase: SupabaseClient<Database>, requestId: string): Promise<PackageReadiness> {
  const candidate = await loadPackageCandidate(supabase, requestId);
  const checks = computeReadinessChecks(candidate);
  return { ready: checks.every((c) => c.ok), checks };
}

export interface PackageSnapshot {
  article: ArticleOutput;
  linkedin: LinkedinPost;
  x: XPost;
  newsletter: Newsletter;
  sourceSetVersionId: string;
  versionIds: { article: string; linkedin: string; x: string; newsletter: string };
}

/**
 * Creates the next immutable package version (SYSTEM-DESIGN-NEXTJS.md §23).
 * Re-validates readiness itself rather than trusting a UI that already
 * showed a ready state moments earlier — state can change between page
 * render and the button click (e.g. a concurrent manual edit).
 */
export async function createContentPackage(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<ContentPackageRow> {
  const candidate = await loadPackageCandidate(supabase, requestId);
  assertContentEditable(candidate.request);
  const checks = computeReadinessChecks(candidate);
  const firstFailure = checks.find((c) => !c.ok);
  if (firstFailure) {
    throw new DomainError("APPROVAL_REQUIRED", "package_creation", firstFailure.message);
  }

  const snapshot: PackageSnapshot = {
    article: candidate.articleVersion!.content as unknown as ArticleOutput,
    linkedin: candidate.channelVersions.linkedin!.content as unknown as LinkedinPost,
    x: candidate.channelVersions.x!.content as unknown as XPost,
    newsletter: candidate.channelVersions.newsletter!.content as unknown as Newsletter,
    sourceSetVersionId: candidate.request.current_source_set_id!,
    versionIds: {
      article: candidate.articleVersion!.id,
      linkedin: candidate.channelVersions.linkedin!.id,
      x: candidate.channelVersions.x!.id,
      newsletter: candidate.channelVersions.newsletter!.id,
    },
  };
  const snapshotHash = hashCanonicalJson(JSON.parse(JSON.stringify(snapshot)));

  const { data, error } = await supabase.rpc("create_content_package", {
    p_request_id: requestId,
    p_article_version_id: candidate.articleVersion!.id,
    p_article_evaluation_id: candidate.articleEvaluation!.id,
    p_linkedin_version_id: candidate.channelVersions.linkedin!.id,
    p_linkedin_evaluation_id: candidate.channelEvaluations.linkedin!.id,
    p_x_version_id: candidate.channelVersions.x!.id,
    p_x_evaluation_id: candidate.channelEvaluations.x!.id,
    p_newsletter_version_id: candidate.channelVersions.newsletter!.id,
    p_newsletter_evaluation_id: candidate.channelEvaluations.newsletter!.id,
    p_snapshot: snapshot as unknown as Json,
    p_snapshot_hash: snapshotHash,
  });
  if (error) throwFromRpcError(error, "package_creation");
  if (!data) throw new Error("create_content_package returned no data");
  return data;
}
