import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError, getErrorMessage } from "@/lib/domain/errors";
import { hashCanonicalJson } from "@/lib/domain/hashing";
import type { AIProvider } from "@/lib/ai/types";
import { generateArticle } from "@/lib/ai/service";
import type { ArticleAngle } from "@/lib/ai/prompts/article-writer";
import type { ContentPlan, ContentPlanSection } from "@/lib/ai/schemas/content-plan";
import { getEvidenceContextForRequest } from "@/lib/grounding/evidence-context";
import { validateClaimEvidence } from "@/lib/grounding/claim-validation";
import {
  getContentArtifactBySlot,
  createContentArtifact,
  createArtifactVersion,
} from "@/lib/repositories/content";
import { createOperationRun, updateOperationRun, findActiveOperationRun } from "@/lib/repositories/operations";
import { recordActivityEvent } from "@/lib/repositories/activity";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type ContentPlanRow = Database["public"]["Tables"]["content_plans"]["Row"];
type ArticleSlot = "A" | "B" | "C";

const ANGLE_BY_SLOT: Record<ArticleSlot, ArticleAngle> = {
  A: "practical",
  B: "strategic",
  C: "educational",
};

export interface ArticleOptionResult {
  slot: ArticleSlot;
  status: "succeeded" | "failed" | "already_running";
  versionId?: string;
  error?: string;
}

async function getRequestOrThrow(supabase: SupabaseClient<Database>, requestId: string): Promise<ContentRequestRow> {
  const { data, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !data) throw error ?? new DomainError("NOT_FOUND", "article_generation", "Request not found.");
  return data;
}

function planRowToContentPlan(row: ContentPlanRow): ContentPlan {
  return {
    insufficientEvidence: false,
    insufficientEvidenceReason: null,
    primaryKeyword: row.primary_keyword,
    secondaryKeywords: ((row.secondary_keywords as string[] | null) ?? []),
    searchIntent: row.search_intent ?? "",
    angle: row.angle ?? "",
    title: row.title,
    sections: (row.sections as unknown as ContentPlanSection[]) ?? [],
    ctaDirection: row.cta_direction,
    links: (row.links as string[] | null) ?? [],
    knownLimitations: row.known_limitations,
  };
}

/**
 * Generates (or regenerates) one article option end to end: acquire the
 * artifact, guard against a duplicate concurrent run for the same option,
 * call the writer, validate its claims against the current evidence, and
 * persist through the immutable-version RPC. Never throws for an
 * individual option's failure — the caller collects per-slot results so
 * one failure cannot erase the others (SYSTEM-DESIGN-NEXTJS.md §26.2).
 */
async function generateOneOption(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  request: ContentRequestRow,
  plan: ContentPlan,
  planId: string,
  evidencePackets: Awaited<ReturnType<typeof getEvidenceContextForRequest>>["packets"],
  validEvidenceIds: Set<string>,
  slot: ArticleSlot
): Promise<ArticleOptionResult> {
  let artifact = await getContentArtifactBySlot(supabase, request.id, "article", slot);
  if (!artifact) {
    try {
      artifact = await createContentArtifact(supabase, { requestId: request.id, kind: "article", slot });
    } catch (error) {
      // Two concurrent calls (e.g. a duplicate button click) can both find
      // no existing artifact and race to create it; the unique index on
      // (request_id, slot) rejects the second insert. Re-fetch instead of
      // failing — the other call's row is the authoritative one.
      artifact = await getContentArtifactBySlot(supabase, request.id, "article", slot);
      if (!artifact) throw error;
    }
  }

  const idempotencyKey = `article_generation:${artifact.id}`;
  const activeRun = await findActiveOperationRun(supabase, request.id, idempotencyKey);
  if (activeRun) {
    return { slot, status: "already_running" };
  }

  let run;
  try {
    run = await createOperationRun(supabase, {
      request_id: request.id,
      operation_type: "article_generation",
      status: "running",
      model: modelId,
      idempotency_key: idempotencyKey,
      base_artifact_version_id: artifact.current_version_id,
      started_at: new Date().toISOString(),
    });
  } catch {
    // Unique-constraint race on the idempotency key: another request is
    // already handling this exact option.
    return { slot, status: "already_running" };
  }

  try {
    const output = await generateArticle(ai, modelId, {
      angle: ANGLE_BY_SLOT[slot],
      audience: request.resolved_audience,
      objective: request.resolved_objective,
      tone: request.resolved_tone,
      cta: request.resolved_cta,
      plan,
      evidencePackets,
    });

    validateClaimEvidence(output.claims, validEvidenceIds);

    const contentHash = hashCanonicalJson(JSON.parse(JSON.stringify(output)));
    const version = await createArtifactVersion(supabase, {
      artifactId: artifact.id,
      expectedCurrentVersionId: artifact.current_version_id,
      changeType: "initial_generation",
      content: output,
      contentHash,
      sourceSetVersionId: request.current_source_set_id!,
      contentPlanId: planId,
      baseArticleVersionId: null,
    });

    await updateOperationRun(supabase, run.id, { status: "succeeded", finished_at: new Date().toISOString() });
    return { slot, status: "succeeded", versionId: version.id };
  } catch (error) {
    await updateOperationRun(supabase, run.id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: getErrorMessage(error),
    });
    return { slot, status: "failed", error: getErrorMessage(error) };
  }
}

/**
 * Generates all three article options from the same request, confirmed
 * source set, and content plan (SYSTEM-DESIGN-NEXTJS.md §15). Options run
 * concurrently; one option's failure never blocks or erases the others.
 */
export async function generateArticleOptions(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  requestId: string
): Promise<ArticleOptionResult[]> {
  const request = await getRequestOrThrow(supabase, requestId);
  if (!request.current_plan_id || !request.current_source_set_id) {
    throw new DomainError("INVALID_STATE", "article_generation", "This request has no confirmed content plan yet.");
  }

  const { data: planRow, error: planError } = await supabase
    .from("content_plans")
    .select()
    .eq("id", request.current_plan_id)
    .single();
  if (planError || !planRow) throw planError ?? new DomainError("NOT_FOUND", "article_generation", "Content plan not found.");

  const plan = planRowToContentPlan(planRow);
  const { packets: evidencePackets, validEvidenceIds } = await getEvidenceContextForRequest(supabase, request);

  const slots: ArticleSlot[] = ["A", "B", "C"];
  const results = await Promise.all(
    slots.map((slot) =>
      generateOneOption(supabase, ai, modelId, request, plan, planRow.id, evidencePackets, validEvidenceIds, slot)
    )
  );

  const succeeded = results.filter((r) => r.status === "succeeded").length;
  await recordActivityEvent({
    requestId,
    eventType: "article_options_generated",
    message: `${succeeded} of 3 article option(s) generated`,
    actorId: request.owner_id,
  });

  return results;
}

/**
 * Regenerates a single, previously failed article option in place
 * (SYSTEM-DESIGN-NEXTJS.md §12 partial-success recovery).
 */
export async function regenerateArticleOption(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  artifactId: string
): Promise<ArticleOptionResult> {
  const { data: artifact, error: artifactError } = await supabase
    .from("content_artifacts")
    .select()
    .eq("id", artifactId)
    .single();
  if (artifactError || !artifact) throw artifactError ?? new DomainError("NOT_FOUND", "article_generation", "Artifact not found.");
  if (artifact.kind !== "article" || !artifact.slot) {
    throw new DomainError("VALIDATION_ERROR", "article_generation", "Only an article option can be regenerated this way.");
  }

  const request = await getRequestOrThrow(supabase, artifact.request_id);
  if (!request.current_plan_id) {
    throw new DomainError("INVALID_STATE", "article_generation", "This request has no confirmed content plan.");
  }

  const { data: planRow, error: planError } = await supabase
    .from("content_plans")
    .select()
    .eq("id", request.current_plan_id)
    .single();
  if (planError || !planRow) throw planError ?? new DomainError("NOT_FOUND", "article_generation", "Content plan not found.");

  const plan = planRowToContentPlan(planRow);
  const { packets: evidencePackets, validEvidenceIds } = await getEvidenceContextForRequest(supabase, request);

  return generateOneOption(
    supabase,
    ai,
    modelId,
    request,
    plan,
    planRow.id,
    evidencePackets,
    validEvidenceIds,
    artifact.slot as ArticleSlot
  );
}
