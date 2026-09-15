"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { getAIProvider, getModelIdFor, resolveAIModelForRequest } from "@/lib/ai/provider";
import { generateContentPlan, saveManualContentPlan, type ManualContentPlanInput } from "@/lib/planning/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";

type ContentPlanRow = Database["public"]["Tables"]["content_plans"]["Row"];

export async function generateContentPlanAction(requestId: string): Promise<ActionResult<ContentPlanRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);

    const { data: request, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
    if (error || !request) throw error;

    const modelChoice = resolveAIModelForRequest(request);
    const ai = await getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    const plan = await generateContentPlan(supabase, ai, modelId, requestId);
    return { ok: true, data: plan };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "generate_content_plan", { requestId });
    return { ok: false, error: actionError };
  }
}

export async function saveManualContentPlanAction(
  requestId: string,
  updates: ManualContentPlanInput
): Promise<ActionResult<ContentPlanRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireContentManager(supabase);
    const plan = await saveManualContentPlan(supabase, requestId, updates, user.userId);
    return { ok: true, data: plan };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "save_manual_content_plan", { requestId });
    return { ok: false, error: actionError };
  }
}
