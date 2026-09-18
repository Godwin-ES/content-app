"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import { getAIProvider, getModelId } from "@/lib/ai/provider";
import { getResearchProvider } from "@/lib/research/provider";
import { runAutoStep, type AutoStepResult } from "@/lib/workspace/auto-mode";
import type { PipelineStage } from "@/lib/workspace/next-action";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";

/**
 * Performs one auto-mode step. The client calls this repeatedly rather than
 * one long-running action doing the whole pipeline: a full run takes minutes,
 * which no single request should hold open, and stepping means progress is
 * visible as it happens and an interrupted run resumes where it stopped.
 */
export async function runAutoStepAction(requestId: string, stopAfter: PipelineStage): Promise<ActionResult<AutoStepResult>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);

    const { data: request, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
    if (error || !request) throw error;

    const ai = await getAIProvider();
    const research = await getResearchProvider();

    const result = await runAutoStep(supabase, ai, research, getModelId(), requestId, stopAfter);
    return { ok: true, data: result };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "auto_mode", { requestId });
    return { ok: false, error: actionError };
  }
}
