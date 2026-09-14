import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AIProvider } from "@/lib/ai/types";
import { createContentPlan as createContentPlanAI } from "@/lib/ai/service";
import type { ContentPlan, ContentPlanSection } from "@/lib/ai/schemas/content-plan";
import { getEvidenceContextForRequest } from "@/lib/grounding/evidence-context";
import { listSourceConflicts } from "@/lib/repositories/sources";
import { recordActivityEvent } from "@/lib/repositories/activity";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type ContentPlanRow = Database["public"]["Tables"]["content_plans"]["Row"];

async function getRequestOrThrow(supabase: SupabaseClient<Database>, requestId: string): Promise<ContentRequestRow> {
  const { data, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !data) throw error ?? new DomainError("NOT_FOUND", "content_plan", "Request not found.");
  return data;
}

/**
 * A factual section without evidence coverage must be rejected even if the
 * AI's JSON was perfectly well-formed (SYSTEM-DESIGN-NEXTJS.md §14, plan
 * Task 11 Step 1). Evidence IDs are checked against the exact confirmed
 * source set's evidence, not just "look plausible".
 */
export function validateContentPlan(plan: ContentPlan | ManualContentPlanInput, validEvidenceIds: Set<string>): void {
  if (!plan.title || plan.title.trim().length === 0) {
    throw new DomainError("VALIDATION_ERROR", "content_plan_validation", "Plan is missing a title (required H1).");
  }
  if (!plan.primaryKeyword || plan.primaryKeyword.trim().length === 0) {
    throw new DomainError("VALIDATION_ERROR", "content_plan_validation", "Plan is missing a primary keyword.");
  }

  for (const section of plan.sections) {
    if (!section.hasFactualClaims) continue;
    if (section.evidenceIds.length === 0) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "content_plan_validation",
        `Section "${section.heading}" is marked as having factual claims but lists no evidence IDs.`
      );
    }
    for (const evidenceId of section.evidenceIds) {
      if (!validEvidenceIds.has(evidenceId)) {
        throw new DomainError(
          "VALIDATION_ERROR",
          "content_plan_validation",
          `Section "${section.heading}" references unknown evidence ID "${evidenceId}". It must come from the current confirmed source set.`
        );
      }
    }
  }
}

async function nextPlanVersionNumber(supabase: SupabaseClient<Database>, requestId: string): Promise<number> {
  const { data } = await supabase
    .from("content_plans")
    .select("version_number")
    .eq("request_id", requestId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version_number ?? 0) + 1;
}

async function persistPlanVersion(
  supabase: SupabaseClient<Database>,
  requestId: string,
  sourceSetVersionId: string,
  plan: {
    title: string;
    primaryKeyword: string;
    secondaryKeywords: string[];
    searchIntent: string;
    angle: string;
    sections: ContentPlanSection[];
    ctaDirection: string | null;
    links: string[];
    knownLimitations: string | null;
  },
  createdBy: string
): Promise<ContentPlanRow> {
  const versionNumber = await nextPlanVersionNumber(supabase, requestId);

  const { data, error } = await supabase
    .from("content_plans")
    .insert({
      request_id: requestId,
      source_set_version_id: sourceSetVersionId,
      version_number: versionNumber,
      primary_keyword: plan.primaryKeyword,
      secondary_keywords: plan.secondaryKeywords as Json,
      search_intent: plan.searchIntent,
      angle: plan.angle,
      title: plan.title,
      sections: plan.sections as unknown as Json,
      cta_direction: plan.ctaDirection,
      links: plan.links as Json,
      known_limitations: plan.knownLimitations,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to save content plan");

  const admin = createSupabaseAdminClient();
  await admin.from("content_requests").update({ current_plan_id: data.id }).eq("id", requestId);

  await recordActivityEvent({
    requestId,
    eventType: "content_plan_created",
    message: `Content plan v${versionNumber} created`,
    actorId: createdBy,
  });

  return data;
}

/**
 * Generates one evidence-backed content plan (SYSTEM-DESIGN-NEXTJS.md §14).
 * Prompt input is limited to resolved settings, curated evidence packets
 * from the confirmed source set, and resolved conflicts — never excluded
 * raw source content.
 */
export async function generateContentPlan(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  requestId: string
): Promise<ContentPlanRow> {
  const request = await getRequestOrThrow(supabase, requestId);
  const { packets: evidencePackets, validEvidenceIds } = await getEvidenceContextForRequest(supabase, request);

  const conflicts = await listSourceConflicts(supabase, requestId);
  const resolvedConflicts = conflicts
    .filter((c) => c.resolution)
    .map((c) => `${c.description} -> resolution: ${c.resolution}${c.resolution_note ? ` (${c.resolution_note})` : ""}`);

  const plan = await createContentPlanAI(ai, modelId, {
    topic: request.topic,
    audience: request.resolved_audience,
    objective: request.resolved_objective,
    tone: request.resolved_tone,
    cta: request.resolved_cta,
    primaryKeyword: request.resolved_primary_keyword,
    evidencePackets,
    resolvedConflicts,
  });

  validateContentPlan(plan, validEvidenceIds);

  return persistPlanVersion(
    supabase,
    requestId,
    request.current_source_set_id!,
    {
      title: plan.title,
      primaryKeyword: plan.primaryKeyword,
      secondaryKeywords: plan.secondaryKeywords,
      searchIntent: plan.searchIntent,
      angle: plan.angle,
      sections: plan.sections,
      ctaDirection: plan.ctaDirection,
      links: plan.links,
      knownLimitations: plan.knownLimitations,
    },
    request.owner_id
  );
}

export interface ManualContentPlanInput {
  title: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: string;
  angle: string;
  sections: ContentPlanSection[];
  ctaDirection: string | null;
  links: string[];
  knownLimitations: string | null;
}

/**
 * Manual edit creates a new immutable plan version (SYSTEM-DESIGN-NEXTJS.md
 * §14: "The plan is immutable once used to generate content. Editing
 * creates a new plan version."). Re-validated against the same current
 * source set's evidence.
 */
export async function saveManualContentPlan(
  supabase: SupabaseClient<Database>,
  requestId: string,
  updates: ManualContentPlanInput,
  actorId: string
): Promise<ContentPlanRow> {
  const request = await getRequestOrThrow(supabase, requestId);
  const { validEvidenceIds } = await getEvidenceContextForRequest(supabase, request);
  validateContentPlan(updates, validEvidenceIds);

  return persistPlanVersion(supabase, requestId, request.current_source_set_id!, updates, actorId);
}
