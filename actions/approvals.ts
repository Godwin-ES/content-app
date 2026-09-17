"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager, requireReviewer } from "@/lib/auth/guards";
import { submitForApproval, withdrawApproval, decideApproval } from "@/lib/approvals/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";
import type { ReviewDecision } from "@/lib/domain/types";

type ApprovalReviewRow = Database["public"]["Tables"]["approval_reviews"]["Row"];

export async function submitForApprovalAction(requestId: string): Promise<ActionResult<ApprovalReviewRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const review = await submitForApproval(supabase, requestId);
    return { ok: true, data: review };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "submit_for_approval", { requestId });
    return { ok: false, error: actionError };
  }
}

export async function withdrawApprovalAction(reviewId: string): Promise<ActionResult<ApprovalReviewRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const review = await withdrawApproval(supabase, reviewId);
    return { ok: true, data: review };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "withdraw_approval", { reviewId });
    return { ok: false, error: actionError };
  }
}

export async function decideApprovalAction(
  reviewId: string,
  packageId: string,
  decision: ReviewDecision,
  comment: string | null
): Promise<ActionResult<ApprovalReviewRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireReviewer(supabase);
    const review = await decideApproval(supabase, { reviewId, packageId, decision, comment });
    return { ok: true, data: review };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "decide_approval", { reviewId, packageId });
    return { ok: false, error: actionError };
  }
}
