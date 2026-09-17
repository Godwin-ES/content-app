import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError, getErrorMessage } from "@/lib/domain/errors";
import { assertContentEditable } from "@/lib/domain/request-guards";
import { hashCanonicalJson } from "@/lib/domain/hashing";
import type { AIProvider } from "@/lib/ai/types";
import { adaptLinkedIn, adaptX, adaptNewsletter, evaluateChannel as evaluateChannelAI } from "@/lib/ai/service";
import type { ChannelAdapterInput } from "@/lib/ai/prompts/linkedin-adapter";
import type { LinkedinPost, XPost, Newsletter, ChannelEvaluation } from "@/lib/ai/schemas/channel";
import { articleBodyMarkdown, type ArticleOutput } from "@/lib/ai/schemas/article";
import { validateLinkedinPost, validateXPost, validateNewsletter, type ChannelCheckResult } from "@/lib/channels/validate";
import {
  getContentArtifactBySlot,
  createContentArtifact,
  createArtifactVersion,
  getArtifactVersion,
} from "@/lib/repositories/content";
import { createOperationRun, updateOperationRun, findActiveOperationRun } from "@/lib/repositories/operations";
import { recordActivityEvent } from "@/lib/repositories/activity";
import { createEvaluation } from "@/lib/repositories/evaluations";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];
type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];
export type ChannelKind = "linkedin" | "x" | "newsletter";

export const CHANNEL_KINDS: ChannelKind[] = ["linkedin", "x", "newsletter"];

export interface ChannelResult {
  channel: ChannelKind;
  status: "succeeded" | "failed" | "already_running";
  versionId?: string;
  error?: string;
}

async function getRequestOrThrow(supabase: SupabaseClient<Database>, requestId: string): Promise<ContentRequestRow> {
  const { data, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !data) throw error ?? new DomainError("NOT_FOUND", "channel_adaptation", "Request not found.");
  return data;
}

async function getSelectedArticle(
  supabase: SupabaseClient<Database>,
  request: ContentRequestRow
): Promise<{ article: ArticleOutput; versionId: string }> {
  if (!request.selected_article_version_id) {
    throw new DomainError("INVALID_STATE", "channel_adaptation", "This request has no selected article yet.");
  }
  const version = await getArtifactVersion(supabase, request.selected_article_version_id);
  if (!version) throw new DomainError("NOT_FOUND", "channel_adaptation", "Selected article version not found.");
  return { article: version.content as unknown as ArticleOutput, versionId: version.id };
}

function deterministicChecksFor(channel: ChannelKind, content: unknown): ChannelCheckResult[] {
  if (channel === "linkedin") return validateLinkedinPost(content as LinkedinPost);
  if (channel === "x") return validateXPost(content as XPost);
  return validateNewsletter(content as Newsletter);
}

function channelOutputText(channel: ChannelKind, content: unknown): string {
  if (channel === "linkedin") return (content as LinkedinPost).body;
  if (channel === "x") return (content as XPost).body;
  const n = content as Newsletter;
  return `${n.subject}\n\n${n.introduction}\n\n${n.bodyMarkdown}\n\n${n.callToAction}\n\n${n.signoff}`;
}

async function adaptOne(ai: AIProvider, modelId: string, channel: ChannelKind, input: ChannelAdapterInput) {
  if (channel === "linkedin") return adaptLinkedIn(ai, modelId, input);
  if (channel === "x") return adaptX(ai, modelId, input);
  return adaptNewsletter(ai, modelId, input);
}

/**
 * Generates (or regenerates) one channel asset end to end. Mirrors
 * generateOneOption in lib/articles/service.ts: never throws for an
 * individual channel's failure so a failed Newsletter, say, cannot erase an
 * already-succeeded LinkedIn/X asset (SYSTEM-DESIGN-NEXTJS.md §21, §26.2).
 */
async function generateOneChannel(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  request: ContentRequestRow,
  article: ArticleOutput,
  articleVersionId: string,
  channel: ChannelKind
): Promise<ChannelResult> {
  let artifact = await getContentArtifactBySlot(supabase, request.id, channel, null);
  if (!artifact) {
    try {
      artifact = await createContentArtifact(supabase, { requestId: request.id, kind: channel, slot: null });
    } catch (error) {
      artifact = await getContentArtifactBySlot(supabase, request.id, channel, null);
      if (!artifact) throw error;
    }
  }

  const idempotencyKey = `channel_adaptation:${artifact.id}`;
  const activeRun = await findActiveOperationRun(supabase, request.id, idempotencyKey);
  if (activeRun) {
    return { channel, status: "already_running" };
  }

  let run;
  try {
    run = await createOperationRun(supabase, {
      request_id: request.id,
      operation_type: "channel_adaptation",
      status: "running",
      model: modelId,
      idempotency_key: idempotencyKey,
      base_artifact_version_id: artifact.current_version_id,
      started_at: new Date().toISOString(),
    });
  } catch {
    return { channel, status: "already_running" };
  }

  try {
    const output = await adaptOne(ai, modelId, channel, {
      audience: request.resolved_audience,
      tone: request.resolved_tone,
      cta: request.resolved_cta,
      articleTitle: article.title,
      articleBodyMarkdown: articleBodyMarkdown(article),
    });

    const contentHash = hashCanonicalJson(JSON.parse(JSON.stringify(output)));
    const version = await createArtifactVersion(supabase, {
      artifactId: artifact.id,
      expectedCurrentVersionId: artifact.current_version_id,
      changeType: "channel_adaptation",
      content: output,
      contentHash,
      sourceSetVersionId: request.current_source_set_id!,
      baseArticleVersionId: articleVersionId,
    });

    await updateOperationRun(supabase, run.id, { status: "succeeded", finished_at: new Date().toISOString() });

    try {
      await evaluateChannelVersion(supabase, ai, modelId, version.id);
    } catch {
      // Swallowed intentionally, same as article auto-evaluation: the
      // channel asset itself still succeeded.
    }

    return { channel, status: "succeeded", versionId: version.id };
  } catch (error) {
    await updateOperationRun(supabase, run.id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: getErrorMessage(error),
    });
    return { channel, status: "failed", error: getErrorMessage(error) };
  }
}

/**
 * Generates all three channel assets from the same selected article
 * (SYSTEM-DESIGN-NEXTJS.md §21). Assets run concurrently and independently;
 * one channel's failure never blocks or erases the others.
 */
export async function generateChannelAssets(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  requestId: string
): Promise<ChannelResult[]> {
  const request = await getRequestOrThrow(supabase, requestId);
  assertContentEditable(request);
  const { article, versionId } = await getSelectedArticle(supabase, request);

  const results = await Promise.all(
    CHANNEL_KINDS.map((channel) => generateOneChannel(supabase, ai, modelId, request, article, versionId, channel))
  );

  const succeeded = results.filter((r) => r.status === "succeeded").length;
  await recordActivityEvent({
    requestId,
    eventType: "channel_assets_generated",
    message: `${succeeded} of 3 channel asset(s) generated`,
    actorId: request.owner_id,
  });

  return results;
}

/**
 * Regenerates a single, previously failed channel asset in place
 * (SYSTEM-DESIGN-NEXTJS.md §12 partial-success recovery).
 */
export async function regenerateChannelAsset(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  artifactId: string
): Promise<ChannelResult> {
  const { data: artifact, error } = await supabase.from("content_artifacts").select().eq("id", artifactId).single();
  if (error || !artifact) throw error ?? new DomainError("NOT_FOUND", "channel_adaptation", "Artifact not found.");
  if (artifact.kind === "article") {
    throw new DomainError("VALIDATION_ERROR", "channel_adaptation", "Only a channel asset can be regenerated this way.");
  }

  const request = await getRequestOrThrow(supabase, artifact.request_id);
  assertContentEditable(request);
  const { article, versionId } = await getSelectedArticle(supabase, request);

  return generateOneChannel(supabase, ai, modelId, request, article, versionId, artifact.kind as ChannelKind);
}

/**
 * Evaluates one channel asset version (SYSTEM-DESIGN-NEXTJS.md §22).
 * Deterministic platform checks run first and always accompany the
 * evaluation; the AI evaluator separately checks Channel Fit, Tone,
 * Clarity, Completeness, and — critically — whether the adaptation
 * increased certainty/specificity/scope beyond the source article
 * (`certaintyInflationDetected`), the one thing channel adaptation must
 * never do.
 */
export async function evaluateChannelVersion(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  channelVersionId: string
): Promise<EvaluationRow> {
  const version = await getArtifactVersion(supabase, channelVersionId);
  if (!version) throw new DomainError("NOT_FOUND", "channel_evaluation", "Channel version not found.");

  const { data: artifact, error: artifactError } = await supabase
    .from("content_artifacts")
    .select()
    .eq("id", version.artifact_id)
    .single();
  if (artifactError || !artifact) throw artifactError ?? new DomainError("NOT_FOUND", "channel_evaluation", "Artifact not found.");
  if (artifact.kind === "article") {
    throw new DomainError("VALIDATION_ERROR", "channel_evaluation", "Only a channel asset version can be evaluated this way.");
  }
  const channel = artifact.kind as ChannelKind;

  const request = await getRequestOrThrow(supabase, artifact.request_id);
  const { article } = await getSelectedArticle(supabase, request);

  const deterministicChecks = deterministicChecksFor(channel, version.content);

  const run = await createOperationRun(supabase, {
    request_id: request.id,
    operation_type: "channel_evaluation",
    status: "running",
    model: modelId,
    base_artifact_version_id: version.id,
    started_at: new Date().toISOString(),
  });

  let evaluation: ChannelEvaluation;
  try {
    evaluation = await evaluateChannelAI(ai, modelId, {
      channel,
      articleBodyMarkdown: articleBodyMarkdown(article),
      channelOutputText: channelOutputText(channel, version.content),
    });
  } catch (error) {
    await updateOperationRun(supabase, run.id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: getErrorMessage(error),
    });
    throw error;
  }

  await updateOperationRun(supabase, run.id, { status: "succeeded", finished_at: new Date().toISOString() });

  return createEvaluation(supabase, {
    artifact_version_id: version.id,
    overall_status: evaluation.overallStatus,
    deterministicChecks,
    criteria: [
      {
        criterion: "channel_fit",
        score: evaluation.channelFit,
        finding: evaluation.findings.join(" ") || "No findings noted.",
        location: null,
        recommendedAction: evaluation.recommendedAction,
      },
    ],
    claimAudit: [],
    unsupportedClaims: evaluation.certaintyInflationDetected
      ? ["Certainty, specificity, or scope inflation relative to the source article was detected."]
      : [],
    sectionsNeedingRevision: [],
    revision_instructions: evaluation.recommendedAction,
    operation_run_id: run.id,
    created_by: request.owner_id,
  });
}

/**
 * Manual edit of a channel asset (SYSTEM-DESIGN-NEXTJS.md §21 Step 4):
 * creates a new immutable version and, by only ever reading the *latest*
 * evaluation for a version, implicitly leaves the prior version's
 * evaluation as historical rather than carrying it forward. Editing one
 * channel never touches the article or the other two channel assets.
 */
export async function saveManualChannelRevision(
  supabase: SupabaseClient<Database>,
  artifactId: string,
  updatedContent: LinkedinPost | XPost | Newsletter,
  actorId: string
): Promise<ArtifactVersionRow> {
  const { data: artifact, error } = await supabase.from("content_artifacts").select().eq("id", artifactId).single();
  if (error || !artifact) throw error ?? new DomainError("NOT_FOUND", "channel_adaptation", "Artifact not found.");
  if (artifact.kind === "article") {
    throw new DomainError("VALIDATION_ERROR", "channel_adaptation", "Only a channel asset can be manually edited this way.");
  }

  const request = await getRequestOrThrow(supabase, artifact.request_id);
  assertContentEditable(request);

  const contentHash = hashCanonicalJson(JSON.parse(JSON.stringify(updatedContent)));
  const version = await createArtifactVersion(supabase, {
    artifactId: artifact.id,
    expectedCurrentVersionId: artifact.current_version_id,
    changeType: "manual_edit",
    content: updatedContent,
    contentHash,
    sourceSetVersionId: request.current_source_set_id!,
    baseArticleVersionId: request.selected_article_version_id,
  });

  await recordActivityEvent({
    requestId: request.id,
    eventType: "channel_manually_edited",
    message: `${artifact.kind} asset manually edited`,
    actorId,
  });

  return version;
}
