"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { getAIProvider, getModelIdFor, resolveAIModelForRequest } from "@/lib/ai/provider";
import { getResearchProvider } from "@/lib/research/provider";
import { runResearchPipeline, retryResearchSource, addPendingSourceUrl, analyzeUploadedMaterialSource } from "@/lib/research/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import { DomainError, type ActionResult } from "@/lib/domain/errors";

export async function startResearchAction(requestId: string): Promise<ActionResult<{ usableSourceCount: number }>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);

    const { data: request, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
    if (error || !request) throw new DomainError("NOT_FOUND", "start_research", "Request not found.");
    if (request.status !== "draft") {
      throw new DomainError("INVALID_STATE", "start_research", "Research has already been started for this request.");
    }

    const { data: activeRun } = await supabase
      .from("operation_runs")
      .select("id")
      .eq("request_id", requestId)
      .eq("operation_type", "research_planning")
      .in("status", ["queued", "running"])
      .maybeSingle();
    if (activeRun) {
      throw new DomainError("INVALID_STATE", "start_research", "Research is already running for this request.", true);
    }

    const modelChoice = resolveAIModelForRequest(request);
    const ai = await getAIProvider(modelChoice);
    const research = await getResearchProvider();
    const modelId = getModelIdFor(modelChoice);

    const result = await runResearchPipeline(supabase, ai, research, modelId, requestId);
    return { ok: true, data: { usableSourceCount: result.usableSourceCount } };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "start_research", { requestId });
    return { ok: false, error: actionError };
  }
}

/**
 * Runs retrieval+analysis (a URL source) or just analysis (a material
 * source) for one existing source — whether it's a first attempt on a
 * `pending` source or a retry on a `failed` one, the underlying work is
 * the same; only the button label the caller shows differs.
 */
export async function startSourceAction(sourceId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);

    const { data: source } = await supabase.from("research_sources").select("request_id, origin").eq("id", sourceId).single();
    if (!source) throw new DomainError("NOT_FOUND", "start_source", "Source not found.");

    const { data: request } = await supabase.from("content_requests").select().eq("id", source.request_id).single();
    if (!request) throw new DomainError("NOT_FOUND", "start_source", "Request not found.");

    const modelChoice = resolveAIModelForRequest(request);
    const ai = await getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    if (source.origin === "uploaded_material") {
      await analyzeUploadedMaterialSource(supabase, ai, modelId, sourceId);
    } else {
      const research = await getResearchProvider();
      await retryResearchSource(supabase, ai, research, modelId, sourceId);
    }
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "start_source");
    return { ok: false, error: actionError };
  }
}

export async function addSourceUrlAction(requestId: string, url: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    await addPendingSourceUrl(supabase, requestId, url);
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "add_source_url", { requestId });
    return { ok: false, error: actionError };
  }
}
