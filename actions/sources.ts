"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import {
  recordSourceDecision,
  resolveSourceConflict,
  confirmSourceSet,
} from "@/lib/repositories/sources";
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
    const sourceSet = await confirmSourceSet(supabase, requestId);
    return { ok: true, data: { versionNumber: sourceSet.version_number } };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "confirm_source_set", { requestId });
    return { ok: false, error: actionError };
  }
}
