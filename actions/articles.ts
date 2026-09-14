"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { getAIProvider, getModelIdFor, resolveAIModelForRequest } from "@/lib/ai/provider";
import { generateArticleOptions, regenerateArticleOption, type ArticleOptionResult } from "@/lib/articles/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";

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
