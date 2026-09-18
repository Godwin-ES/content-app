"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import { withdrawApproval, decideOwnPackage } from "@/lib/approvals/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";
import type { ReviewDecision } from "@/lib/domain/types";

type ApprovalReviewRow = Database["public"]["Tables"]["approval_reviews"]["Row"];

export async function withdrawApprovalAction(reviewId: string): Promise<ActionResult<ApprovalReviewRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    const review = await withdrawApproval(supabase, reviewId);
    return { ok: true, data: review };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "withdraw_approval", { reviewId });
    return { ok: false, error: actionError };
  }
}

/**
 * Approve, or record what needs changing, on the request's current
 * package. One call because there is one person: the submit step it used
 * to require existed only to hand the package to someone else.
 */
export async function decideOwnPackageAction(
  requestId: string,
  decision: ReviewDecision,
  comment: string | null
): Promise<ActionResult<ApprovalReviewRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    const review = await decideOwnPackage(supabase, requestId, decision, comment);
    return { ok: true, data: review };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "decide_approval", { requestId });
    return { ok: false, error: actionError };
  }
}
