"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { getAIProvider, getModelIdFor, resolveAIModelForRequest } from "@/lib/ai/provider";
import {
  generateArticleOptions,
  regenerateArticleOption,
  evaluateArticleVersion,
  autoReviseArticle,
  saveManualArticleRevision,
  proposeTargetedRevision,
  applyTargetedRevision,
  selectArticle,
  type ArticleOptionResult,
} from "@/lib/articles/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import { DomainError, type ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleOutput } from "@/lib/ai/schemas/article";

type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];
type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];

/** Resolves the AI provider/model for the request that owns a given article version. */
async function providerForArticleVersion(supabase: SupabaseClient<Database>, articleVersionId: string) {
  const { data: version } = await supabase.from("artifact_versions").select("artifact_id").eq("id", articleVersionId).single();
  if (!version) throw new DomainError("NOT_FOUND", "article_revision", "Article version not found.");
  const { data: artifact } = await supabase.from("content_artifacts").select("request_id").eq("id", version.artifact_id).single();
  if (!artifact) throw new DomainError("NOT_FOUND", "article_revision", "Artifact not found.");
  const { data: request, error } = await supabase.from("content_requests").select().eq("id", artifact.request_id).single();
  if (error || !request) throw error;

  const modelChoice = resolveAIModelForRequest(request);
  return { ai: await getAIProvider(modelChoice), modelId: getModelIdFor(modelChoice) };
}

export async function generateArticleOptionsAction(requestId: string): Promise<ActionResult<ArticleOptionResult[]>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);

    const { data: request, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
    if (error || !request) throw error;

    const modelChoice = resolveAIModelForRequest(request);
    const ai = await getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    const results = await generateArticleOptions(supabase, ai, modelId, requestId);
    return { ok: true, data: results };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "generate_article_options", { requestId });
    return { ok: false, error: actionError };
  }
}

export async function retryArticleOptionAction(artifactId: string): Promise<ActionResult<ArticleOptionResult>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);

    const { data: artifact } = await supabase.from("content_artifacts").select("request_id").eq("id", artifactId).single();
    if (!artifact) throw new Error("Artifact not found");

    const { data: request, error } = await supabase.from("content_requests").select().eq("id", artifact.request_id).single();
    if (error || !request) throw error;

    const modelChoice = resolveAIModelForRequest(request);
    const ai = await getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    const result = await regenerateArticleOption(supabase, ai, modelId, artifactId);
    return { ok: true, data: result };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "retry_article_option", { artifactId });
    return { ok: false, error: actionError };
  }
}

export async function evaluateArticleAction(articleVersionId: string): Promise<ActionResult<EvaluationRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);

    const { data: version } = await supabase.from("artifact_versions").select("artifact_id").eq("id", articleVersionId).single();
    if (!version) throw new Error("Article version not found");
    const { data: artifact } = await supabase.from("content_artifacts").select("request_id").eq("id", version.artifact_id).single();
    if (!artifact) throw new Error("Artifact not found");
    const { data: request, error } = await supabase.from("content_requests").select().eq("id", artifact.request_id).single();
    if (error || !request) throw error;

    const modelChoice = resolveAIModelForRequest(request);
    const ai = await getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    const evaluation = await evaluateArticleVersion(supabase, ai, modelId, articleVersionId);
    return { ok: true, data: evaluation };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "evaluate_article", { articleVersionId });
    return { ok: false, error: actionError };
  }
}

export async function autoReviseArticleAction(
  articleVersionId: string
): Promise<ActionResult<{ versionId: string; evaluationId: string }>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const { ai, modelId } = await providerForArticleVersion(supabase, articleVersionId);
    const result = await autoReviseArticle(supabase, ai, modelId, articleVersionId);
    return { ok: true, data: result };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "auto_revise_article", { articleVersionId });
    return { ok: false, error: actionError };
  }
}

export async function saveManualArticleRevisionAction(
  artifactId: string,
  updatedContent: ArticleOutput
): Promise<ActionResult<ArtifactVersionRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireContentManager(supabase);
    const version = await saveManualArticleRevision(supabase, artifactId, updatedContent, user.userId);
    return { ok: true, data: version };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "save_manual_article_revision", { artifactId });
    return { ok: false, error: actionError };
  }
}

export async function proposeTargetedRevisionAction(
  articleVersionId: string,
  targetSection: string,
  instruction: string
): Promise<ActionResult<ArticleOutput>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const { ai, modelId } = await providerForArticleVersion(supabase, articleVersionId);
    const proposal = await proposeTargetedRevision(supabase, ai, modelId, articleVersionId, targetSection, instruction);
    return { ok: true, data: proposal };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "propose_targeted_revision", { articleVersionId });
    return { ok: false, error: actionError };
  }
}

export async function applyTargetedRevisionAction(
  articleVersionId: string,
  proposedContent: ArticleOutput
): Promise<ActionResult<ArtifactVersionRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireContentManager(supabase);
    const version = await applyTargetedRevision(supabase, articleVersionId, proposedContent, user.userId);
    return { ok: true, data: version };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "apply_targeted_revision", { articleVersionId });
    return { ok: false, error: actionError };
  }
}

export async function selectArticleAction(requestId: string, articleVersionId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireContentManager(supabase);
    await selectArticle(supabase, requestId, articleVersionId, user.userId);
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "select_article", { requestId, articleVersionId });
    return { ok: false, error: actionError };
  }
}
