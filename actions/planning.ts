"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { getAIProvider, getModelIdFor, resolveAIModelForRequest } from "@/lib/ai/provider";
import {
  generateContentPlan,
  saveManualContentPlan,
  listContentPlanVersions,
  regeneratePlanSectionPreview,
  regenerateWholePlanDraft,
  revertToPlanVersion,
  type ManualContentPlanInput,
} from "@/lib/planning/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";
import type { ContentPlanSection } from "@/lib/ai/schemas/content-plan";

type ContentPlanRow = Database["public"]["Tables"]["content_plans"]["Row"];

async function requestAndModel(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, requestId: string) {
  const { data: request, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !request) throw error ?? new Error("Request not found.");
  const modelChoice = resolveAIModelForRequest(request);
  const ai = await getAIProvider(modelChoice);
  const modelId = getModelIdFor(modelChoice);
  return { ai, modelId };
}

/**
 * Generates a plan — with an optional Content Manager instruction, this is
 * also the "Regenerate whole plan" action (Phase 3 of the post-Task-22 UX
 * pass), not a separate operation.
 */
export async function generateContentPlanAction(requestId: string, instruction: string | null = null): Promise<ActionResult<ContentPlanRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const { ai, modelId } = await requestAndModel(supabase, requestId);
    const plan = await generateContentPlan(supabase, ai, modelId, requestId, instruction);
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

export async function listContentPlanVersionsAction(requestId: string): Promise<ActionResult<ContentPlanRow[]>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const versions = await listContentPlanVersions(supabase, requestId);
    return { ok: true, data: versions };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "list_content_plan_versions", { requestId });
    return { ok: false, error: actionError };
  }
}

/**
 * Proposes a replacement for one section only — nothing is saved. Fits
 * into the caller's shared draft buffer, which is what "Save Version"
 * (saveManualContentPlanAction) later persists as one new version.
 */
export async function regeneratePlanSectionPreviewAction(
  requestId: string,
  currentDraft: { title: string; angle: string; sections: ContentPlanSection[] },
  sectionIndex: number,
  instruction: string | null
): Promise<ActionResult<ContentPlanSection>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const { ai, modelId } = await requestAndModel(supabase, requestId);
    const section = await regeneratePlanSectionPreview(ai, modelId, supabase, requestId, currentDraft, sectionIndex, instruction);
    return { ok: true, data: section };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "regenerate_plan_section", { requestId });
    return { ok: false, error: actionError };
  }
}

export async function regenerateWholePlanDraftAction(
  requestId: string,
  instruction: string | null
): Promise<ActionResult<ManualContentPlanInput>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const { ai, modelId } = await requestAndModel(supabase, requestId);
    const draft = await regenerateWholePlanDraft(supabase, ai, modelId, requestId, instruction);
    return { ok: true, data: draft };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "regenerate_whole_plan_draft", { requestId });
    return { ok: false, error: actionError };
  }
}

export async function revertToPlanVersionAction(requestId: string, versionId: string): Promise<ActionResult<ContentPlanRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireContentManager(supabase);
    const plan = await revertToPlanVersion(supabase, requestId, versionId, user.userId);
    return { ok: true, data: plan };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "revert_plan_version", { requestId });
    return { ok: false, error: actionError };
  }
}
