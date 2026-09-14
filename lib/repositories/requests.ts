import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { contentRequestInputSchema } from "@/lib/domain/schemas";
import { resolveRequestSettings } from "@/lib/domain/defaults";
import { assertAllowedAIModel } from "@/lib/ai/model-config";
import { DomainError } from "@/lib/domain/errors";
import { recordActivityEvent } from "@/lib/repositories/activity";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];

/**
 * Validates, resolves visible defaults, and persists a new content request
 * in `draft`. Cheap validation runs before any database write
 * (SYSTEM-DESIGN-NEXTJS.md §7.4); the AI model choice, if any, is checked
 * against the current test-mode boundary before being stored.
 */
export async function createContentRequest(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  rawInput: unknown,
  aiModelChoice?: string
): Promise<ContentRequestRow> {
  const parsed = contentRequestInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "create_content_request",
      parsed.error.issues[0]?.message ?? "Invalid request input."
    );
  }
  const input = parsed.data;

  if (aiModelChoice !== undefined) {
    assertAllowedAIModel(aiModelChoice);
  }
  const testModelChoice = process.env.ENABLE_AI_TEST_MODE === "true" ? (aiModelChoice ?? null) : null;

  const resolved = resolveRequestSettings(input);

  const { data, error } = await supabase
    .from("content_requests")
    .insert({
      owner_id: ownerId,
      topic: input.topic,
      supplied_audience: input.audience ?? null,
      supplied_objective: input.objective ?? null,
      supplied_tone: input.tone ?? null,
      supplied_cta: input.cta ?? null,
      supplied_primary_keyword: input.primaryKeyword ?? null,
      resolved_audience: resolved.audience.value,
      resolved_objective: resolved.objective.value,
      resolved_tone: resolved.tone.value,
      resolved_cta: resolved.cta.value,
      resolved_primary_keyword: resolved.primaryKeyword.value,
      additional_instructions: input.additionalInstructions ?? null,
      source_urls: (input.sourceUrls ?? []) as Json,
      publication_date: input.publicationDate ?? null,
      test_model_choice: testModelChoice,
      status: "draft",
    })
    .select()
    .single();

  if (error || !data) throw error ?? new Error("Failed to create content request");

  await recordActivityEvent({
    requestId: data.id,
    eventType: "request_created",
    message: `Request created: ${data.topic}`,
    actorId: ownerId,
  });

  return data;
}

export interface ContentManagerDashboard {
  needsAttention: ContentRequestRow[];
  sourceReview: ContentRequestRow[];
  awaitingApproval: ContentRequestRow[];
  approvedReady: ContentRequestRow[];
  other: ContentRequestRow[];
}

/**
 * Groups the Content Manager's own requests by actionable stage
 * (SYSTEM-DESIGN-NEXTJS.md §34.4). Prioritizes what needs a decision over
 * technical status detail.
 */
export async function getContentManagerDashboard(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<ContentManagerDashboard> {
  const { data, error } = await supabase
    .from("content_requests")
    .select()
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  return {
    needsAttention: rows.filter((r) => r.status === "changes_requested" || r.status === "rejected"),
    sourceReview: rows.filter((r) => r.status === "source_review"),
    awaitingApproval: rows.filter((r) => r.status === "pending_approval"),
    approvedReady: rows.filter((r) => r.status === "approved"),
    other: rows.filter((r) => r.status === "draft" || r.status === "content_development" || r.status === "archived"),
  };
}

export async function getContentRequest(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<ContentRequestRow | null> {
  const { data, error } = await supabase.from("content_requests").select().eq("id", requestId).maybeSingle();
  if (error) throw error;
  return data;
}
