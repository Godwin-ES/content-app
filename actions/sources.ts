"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import {
  recordSourceDecision,
  resolveSourceConflict,
  deleteResearchSource,
  getResearchSource,
} from "@/lib/repositories/sources";
import { confirmReviewedSourceSet } from "@/lib/research/service";
import { deleteSupportingMaterial } from "@/lib/repositories/materials";
import { DomainError } from "@/lib/domain/errors";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";

export async function recordSourceDecisionAction(
  sourceId: string,
  decision: "accepted" | "excluded",
  reason: string | null
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireContentManager(supabase);
    await recordSourceDecision(supabase, { sourceId, decision, reason, decidedBy: user.userId });
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "source_decision", { sourceId });
    return { ok: false, error: actionError };
  }
}

export async function resolveSourceConflictAction(
  conflictId: string,
  resolution: "prefer_source_a" | "prefer_source_b" | "present_both" | "avoid_claim",
  note: string | null
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireContentManager(supabase);
    await resolveSourceConflict(supabase, { conflictId, resolution, note, resolvedBy: user.userId });
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "source_conflict_resolution", { conflictId });
    return { ok: false, error: actionError };
  }
}

export async function confirmSourceSetAction(requestId: string): Promise<ActionResult<{ versionNumber: number }>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const sourceSet = await confirmReviewedSourceSet(supabase, requestId);
    return { ok: true, data: { versionNumber: sourceSet.version_number } };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "confirm_source_set", { requestId });
    return { ok: false, error: actionError };
  }
}

/**
 * A material-backed source is removed through the material itself
 * (deleteSupportingMaterial also cleans up the storage file, and re-checks
 * that nothing has been researched yet) — deleting only the source row
 * here would leave the uploaded file and its database row behind forever.
 */
export async function deleteSourceAction(sourceId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const source = await getResearchSource(supabase, sourceId);
    if (!source) throw new DomainError("NOT_FOUND", "delete_source", "Source not found.");

    if (source.origin === "uploaded_material" && source.supporting_material_id) {
      await deleteSupportingMaterial(supabase, source.supporting_material_id);
    } else {
      await deleteResearchSource(supabase, sourceId);
    }
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "delete_source", { sourceId });
    return { ok: false, error: actionError };
  }
}
