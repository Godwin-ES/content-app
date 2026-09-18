import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { contentRequestInputSchema } from "@/lib/domain/schemas";
import { resolveRequestSettings } from "@/lib/domain/defaults";
import { assertAllowedAIModel } from "@/lib/ai/model-config";
import { DomainError } from "@/lib/domain/errors";
import { recordActivityEvent } from "@/lib/repositories/activity";
import { throwFromRpcError } from "@/lib/supabase/rpc";

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
      supplied_sources_only: input.suppliedSourcesOnly ?? false,
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

/**
 * Every request this Content Manager owns, newest activity first. The
 * dashboard groups them for display itself; this deliberately returns one
 * flat list rather than pre-bucketed groups, because the previous version
 * split rows across five named buckets that the page then concatenated —
 * and any status missing from all five (a draft, as it turned out) simply
 * never reached the page.
 */
export async function listOwnedRequests(supabase: SupabaseClient<Database>, ownerId: string): Promise<ContentRequestRow[]> {
  const { data, error } = await supabase
    .from("content_requests")
    .select()
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getContentRequest(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<ContentRequestRow | null> {
  const { data, error } = await supabase.from("content_requests").select().eq("id", requestId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Deletes a request outright. `delete_request` re-checks ownership and
 * refuses once it has been approved or sent back for changes, and removes
 * every dependant row in the order the non-cascading provenance FKs
 * require; the one thing it cannot reach is the actual file bytes in
 * Storage, so those are removed first, explicitly, the same way a single
 * supporting material's own delete action already does.
 */
export async function deleteRequest(supabase: SupabaseClient<Database>, requestId: string): Promise<void> {
  const { data: materials, error: materialsError } = await supabase
    .from("supporting_materials")
    .select("storage_path")
    .eq("request_id", requestId);
  if (materialsError) throw materialsError;

  const storagePaths = (materials ?? []).map((m) => m.storage_path).filter((p): p is string => Boolean(p));
  if (storagePaths.length > 0) {
    await supabase.storage.from("content-support").remove(storagePaths);
  }

  const { error } = await supabase.rpc("delete_request", { p_request_id: requestId });
  // Mapped rather than rethrown raw: the RPC's own INVALID_STATE /
  // PERMISSION_DENIED messages are written to be read by the person who
  // clicked Delete, and a bare PostgrestError would hide them.
  if (error) throwFromRpcError(error, "delete_request");
}

/**
 * Sets (or clears) the keyword the article is written to rank for.
 *
 * Clearing it is not the same as leaving it alone: both the supplied and
 * the resolved column go back to null, which hands the field back to the
 * research plan to derive. The RPC re-checks ownership and refuses once
 * the request is under review — changing what a package was written to
 * target while it is sitting in front of a decision would make that decision
 * meaningless.
 */
export async function setRequestPrimaryKeyword(
  supabase: SupabaseClient<Database>,
  requestId: string,
  primaryKeyword: string | null
): Promise<void> {
  const { error } = await supabase.rpc("set_request_primary_keyword", {
    p_request_id: requestId,
    p_primary_keyword: primaryKeyword ?? "",
  });
  if (error) throwFromRpcError(error, "set_request_primary_keyword");
}

/** Sets (or clears) the CTA every channel asset adapts. Same rules as above. */
export async function setRequestCta(
  supabase: SupabaseClient<Database>,
  requestId: string,
  cta: string | null
): Promise<void> {
  const { error } = await supabase.rpc("set_request_cta", { p_request_id: requestId, p_cta: cta ?? "" });
  if (error) throwFromRpcError(error, "set_request_cta");
}

/**
 * Whether research stays strictly inside the supplied materials and URLs.
 * Draft-only, enforced by the RPC — content_requests has no UPDATE policy,
 * so a plain `.update()` here is silently narrowed to zero rows by RLS and
 * reports success without changing anything.
 */
export async function setSuppliedSourcesOnly(
  supabase: SupabaseClient<Database>,
  requestId: string,
  value: boolean
): Promise<void> {
  const { error } = await supabase.rpc("set_supplied_sources_only", { p_request_id: requestId, p_value: value });
  if (error) throwFromRpcError(error, "set_supplied_sources_only");
}
