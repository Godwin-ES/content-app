"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import { getAIProvider, getModelIdFor, resolveAIModelForRequest } from "@/lib/ai/provider";
import {
  generateChannelAssets,
  regenerateChannelAsset,
  proposeChannelRevision,
  evaluateChannelVersion,
  saveManualChannelRevision,
  type ChannelResult,
} from "@/lib/channels/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";
import type { LinkedinPost, Newsletter, XPost } from "@/lib/ai/schemas/channel";

type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];
type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];

export async function generateChannelsAction(requestId: string): Promise<ActionResult<ChannelResult[]>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);

    const { data: request, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
    if (error || !request) throw error;

    const modelChoice = resolveAIModelForRequest(request);
    const ai = await getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    const results = await generateChannelAssets(supabase, ai, modelId, requestId);
    return { ok: true, data: results };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "generate_channel_assets", { requestId });
    return { ok: false, error: actionError };
  }
}

export async function retryChannelAction(artifactId: string): Promise<ActionResult<ChannelResult>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);

    const { data: artifact } = await supabase.from("content_artifacts").select("request_id").eq("id", artifactId).single();
    if (!artifact) throw new Error("Artifact not found");

    const { data: request, error } = await supabase.from("content_requests").select().eq("id", artifact.request_id).single();
    if (error || !request) throw error;

    const modelChoice = resolveAIModelForRequest(request);
    const ai = await getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    const result = await regenerateChannelAsset(supabase, ai, modelId, artifactId);
    return { ok: true, data: result };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "retry_channel_asset", { artifactId });
    return { ok: false, error: actionError };
  }
}

export async function evaluateChannelAction(channelVersionId: string): Promise<ActionResult<EvaluationRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);

    const { data: version } = await supabase.from("artifact_versions").select("artifact_id").eq("id", channelVersionId).single();
    if (!version) throw new Error("Channel version not found");
    const { data: artifact } = await supabase.from("content_artifacts").select("request_id").eq("id", version.artifact_id).single();
    if (!artifact) throw new Error("Artifact not found");
    const { data: request, error } = await supabase.from("content_requests").select().eq("id", artifact.request_id).single();
    if (error || !request) throw error;

    const modelChoice = resolveAIModelForRequest(request);
    const ai = await getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    const evaluation = await evaluateChannelVersion(supabase, ai, modelId, channelVersionId);
    return { ok: true, data: evaluation };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "evaluate_channel_asset", { channelVersionId });
    return { ok: false, error: actionError };
  }
}

/**
 * Proposes a whole-post regeneration, with an explicit instruction — a
 * preview only, nothing persists until Save Version
 * (saveManualChannelRevisionAction).
 */
export async function proposeChannelRevisionAction(
  artifactId: string,
  instruction: string | null
): Promise<ActionResult<LinkedinPost | XPost | Newsletter>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);

    const { data: artifact } = await supabase.from("content_artifacts").select("request_id").eq("id", artifactId).single();
    if (!artifact) throw new Error("Artifact not found");
    const { data: request, error } = await supabase.from("content_requests").select().eq("id", artifact.request_id).single();
    if (error || !request) throw error;

    const modelChoice = resolveAIModelForRequest(request);
    const ai = await getAIProvider(modelChoice);
    const modelId = getModelIdFor(modelChoice);

    const proposal = await proposeChannelRevision(supabase, ai, modelId, artifactId, instruction);
    return { ok: true, data: proposal };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "propose_channel_revision", { artifactId });
    return { ok: false, error: actionError };
  }
}

export async function saveManualChannelRevisionAction(
  artifactId: string,
  updatedContent: LinkedinPost | XPost | Newsletter
): Promise<ActionResult<ArtifactVersionRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireSignedIn(supabase);
    const version = await saveManualChannelRevision(supabase, artifactId, updatedContent, user.userId);
    return { ok: true, data: version };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "save_manual_channel_revision", { artifactId });
    return { ok: false, error: actionError };
  }
}
