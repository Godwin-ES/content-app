import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { contentRequestInputSchema } from "@/lib/domain/schemas";
import { resolveRequestSettings } from "@/lib/domain/defaults";
import { assertAllowedAIModel } from "@/lib/ai/model-config";
import { DomainError } from "@/lib/domain/errors";
import { recordActivityEvent } from "@/lib/repositories/activity";
import { throwFromRpcError } from "@/lib/supabase/rpc";
import { DELETED_REQUEST_RETENTION_DAYS } from "@/lib/domain/retention";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];

/**
 * Validates, resolves visible defaults, and persists a new content request
 * in `draft`. Cheap validation runs before any database write
 * (SYSTEM-DESIGN-NEXTJS.md §7.4); the AI model choice, if any, is checked
 * against the allowed list before being stored.
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
      supplied_sources_only: input.suppliedSourcesOnly ?? false,
      ai_model_choice: aiModelChoice ?? null,
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
 * Every live request this account owns, newest activity first. The
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
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * The bin: deleted requests still inside the restore window, most recently
 * deleted first.
 *
 * Filtered by date rather than by "does the row still exist", so the UI can
 * never offer a restore it cannot honour. The sweep that physically removes
 * expired rows runs inside the delete and restore RPCs, so a row can
 * briefly outlive its window; it is excluded here regardless.
 */
export async function listDeletedRequests(supabase: SupabaseClient<Database>, ownerId: string): Promise<ContentRequestRow[]> {
  const cutoff = new Date(Date.now() - DELETED_REQUEST_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("content_requests")
    .select()
    .eq("owner_id", ownerId)
    .not("deleted_at", "is", null)
    .gte("deleted_at", cutoff)
    .order("deleted_at", { ascending: false });
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
 * Removes every request past the restore window, and the files they leave
 * behind.
 *
 * The database purge cannot reach Storage, so it hands back the paths it
 * just orphaned and they are deleted here. Run before binning or restoring
 * — the bin cleans itself whenever it is used, which needs no scheduler.
 * A deployment with pg_cron should also schedule `purge_expired_requests()`
 * directly; the listing filters on the same window either way, so the UI
 * never offers a restore it cannot honour.
 *
 * Best-effort on the Storage half: a bucket that refuses a delete must not
 * fail the operation the caller actually asked for, and the rows are
 * already gone by then.
 */
export async function sweepExpiredRequests(supabase: SupabaseClient<Database>): Promise<void> {
  const { data, error } = await supabase.rpc("purge_expired_requests");
  if (error) throwFromRpcError(error, "purge_expired_requests");

  const paths = (data ?? []) as string[];
  if (paths.length > 0) {
    await supabase.storage.from("content-support").remove(paths);
  }
}

/**
 * Moves a request to the bin. Reversible for 30 days, which is why it is
 * allowed at any point in a request's life including after approval — and
 * why the uploaded files stay in Storage. They go only when the request is
 * actually purged, because a restore has to bring back the whole request,
 * not a copy with its attachments missing.
 *
 * The RPC cancels any queued publishing items, so a binned request cannot
 * keep a place in the queue.
 */
export async function deleteRequest(supabase: SupabaseClient<Database>, requestId: string): Promise<void> {
  await sweepExpiredRequests(supabase);

  const { error } = await supabase.rpc("delete_request", { p_request_id: requestId });
  // Mapped rather than rethrown raw: the RPC's own INVALID_STATE /
  // PERMISSION_DENIED messages are written to be read by the person who
  // clicked Delete, and a bare PostgrestError would hide them.
  if (error) throwFromRpcError(error, "delete_request");
}

/** Brings a request back out of the bin, if it is still inside the window. */
export async function restoreRequest(supabase: SupabaseClient<Database>, requestId: string): Promise<void> {
  await sweepExpiredRequests(supabase);

  const { error } = await supabase.rpc("restore_request", { p_request_id: requestId });
  if (error) throwFromRpcError(error, "restore_request");
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
