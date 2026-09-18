import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { bestEffort } from "@/lib/notifications/action-error";
import { notifyContentManagerDecision } from "@/lib/notifications/service";
import {
  getLatestReview,
  submitPackageForReview,
  withdrawPackageReview,
  decidePackageReview,
} from "@/lib/repositories/approvals";
import { assertNoInjectedPersistenceFailure } from "@/lib/test-support/failure-injection";
import type { ReviewDecision } from "@/lib/domain/types";

type ApprovalReviewRow = Database["public"]["Tables"]["approval_reviews"]["Row"];
type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];

async function getRequestOrThrow(supabase: SupabaseClient<Database>, requestId: string): Promise<ContentRequestRow> {
  const { data, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !data) throw error ?? new DomainError("NOT_FOUND", "approval", "Request not found.");
  return data;
}

/**
 * Opens a review cycle on the request's current package
 * (SYSTEM-DESIGN-NEXTJS.md §24.1), freezing that exact version as the
 * thing being decided on. The notification is best-effort: a Discord
 * delivery failure must never block or roll back an otherwise-successful
 * submission (§26.3, §28.3).
 */
export async function submitForApproval(supabase: SupabaseClient<Database>, requestId: string): Promise<ApprovalReviewRow> {
  const request = await getRequestOrThrow(supabase, requestId);
  if (!request.current_package_id) {
    throw new DomainError("INVALID_STATE", "approval", "This request has no package to submit.");
  }
  await assertNoInjectedPersistenceFailure("approval_persistence_failure", "approval");
  const review = await submitPackageForReview(supabase, requestId, request.current_package_id);
  return review;
}

/**
 * Backs out of a review cycle that is still pending, returning the request
 * to content development. With one account this is mostly a way out of a
 * review opened before submit-and-decide became one step; the RPC still
 * refuses once a decision has been recorded.
 */
export async function withdrawApproval(supabase: SupabaseClient<Database>, reviewId: string): Promise<ApprovalReviewRow> {
  return withdrawPackageReview(supabase, reviewId);
}

export async function decideApproval(
  supabase: SupabaseClient<Database>,
  params: { reviewId: string; packageId: string; decision: ReviewDecision; comment: string | null }
): Promise<ApprovalReviewRow> {
  await assertNoInjectedPersistenceFailure("approval_persistence_failure", "approval");
  const review = await decidePackageReview(supabase, params);
  const request = await getRequestOrThrow(supabase, review.request_id);
  await bestEffort(() =>
    notifyContentManagerDecision({ requestId: request.id, topic: request.topic, decision: params.decision, comment: params.comment })
  );
  return review;
}

/**
 * The owner's approval decision on their own package, in one step.
 *
 * With one account there is no second person to hand the package to, so
 * "submit for approval" and "approve" collapsed into a single deliberate
 * act. What is deliberately NOT collapsed is the gate itself: a human
 * still has to look at a specific package version and decide on it before
 * anything can be queued for publishing, which is what the brief requires.
 *
 * It still writes a full review cycle — submitted_at, decided_by,
 * decided_at, the exact package_id, and the comment — because that record
 * is the evidence the gate was honoured, and because Request Changes feeds
 * the revision flow from the same rows it always did.
 *
 * A package already sitting in a pending review (submitted before this
 * became one step, or opened in another tab) is decided in place rather
 * than submitted a second time.
 */
export async function decideOwnPackage(
  supabase: SupabaseClient<Database>,
  requestId: string,
  decision: ReviewDecision,
  comment: string | null
): Promise<ApprovalReviewRow> {
  const request = await getRequestOrThrow(supabase, requestId);
  if (!request.current_package_id) {
    throw new DomainError("INVALID_STATE", "approval", "This request has no package to decide on.");
  }

  const latest = await getLatestReview(supabase, requestId);
  const pending = latest?.status === "pending" && latest.package_id === request.current_package_id ? latest : null;
  const review = pending ?? (await submitForApproval(supabase, requestId));

  return decideApproval(supabase, {
    reviewId: review.id,
    packageId: request.current_package_id,
    decision,
    comment,
  });
}
