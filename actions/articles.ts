"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { getAIProvider, getModelIdFor, resolveAIModelForRequest } from "@/lib/ai/provider";
import { generateArticleOptions, regenerateArticleOption, evaluateArticleVersion, type ArticleOptionResult } from "@/lib/articles/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";

type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];

export async function generateArticleOptionsAction(requestId: string): Promise<ActionResult<ArticleOptionResult[]>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);

    const { data: request, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
    if (error || !request) throw error;

    const modelChoice = resolveAIModelForRequest(request);
    const ai = getAIProvider(modelChoice);
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
    const ai = getAIProvider(modelChoice);
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
    const ai = getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    const evaluation = await evaluateArticleVersion(supabase, ai, modelId, articleVersionId);
    return { ok: true, data: evaluation };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "evaluate_article", { articleVersionId });
    return { ok: false, error: actionError };
  }
}
