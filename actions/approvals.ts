"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager, requireReviewer } from "@/lib/auth/guards";
import { submitForApproval, withdrawApproval, decideApproval, reopenRejectedRequest } from "@/lib/approvals/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";

type ApprovalReviewRow = Database["public"]["Tables"]["approval_reviews"]["Row"];
type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];

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
  decision: "approved" | "changes_requested" | "rejected",
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

export async function reopenRejectedRequestAction(requestId: string): Promise<ActionResult<ContentRequestRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const request = await reopenRejectedRequest(supabase, requestId);
    return { ok: true, data: request };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "reopen_rejected_request", { requestId });
    return { ok: false, error: actionError };
  }
}
