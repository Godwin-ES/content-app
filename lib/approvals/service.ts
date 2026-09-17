import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { bestEffort } from "@/lib/notifications/action-error";
import { notifyReviewerSubmission, notifyReviewerWithdrawal, notifyContentManagerDecision } from "@/lib/notifications/service";
import {
  getLatestReview,
  listReviewsForRequest,
  listPendingReviews,
  listDecidedReviews,
  submitPackageForReview,
  withdrawPackageReview,
  decidePackageReview,
} from "@/lib/repositories/approvals";
import { getSourceSetSources } from "@/lib/repositories/sources";
import { assertNoInjectedPersistenceFailure } from "@/lib/test-support/failure-injection";
import type { ReviewDecision } from "@/lib/domain/types";

type ApprovalReviewRow = Database["public"]["Tables"]["approval_reviews"]["Row"];
type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type ContentPackageRow = Database["public"]["Tables"]["content_packages"]["Row"];
type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];
type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];

async function getRequestOrThrow(supabase: SupabaseClient<Database>, requestId: string): Promise<ContentRequestRow> {
  const { data, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !data) throw error ?? new DomainError("NOT_FOUND", "approval", "Request not found.");
  return data;
}

/**
 * Submits the request's current package for independent review
 * (SYSTEM-DESIGN-NEXTJS.md §24.1). The reviewer notification is
 * best-effort: a Discord delivery failure must never block or roll back
 * an otherwise-successful submission (§26.3, §28.3).
 */
export async function submitForApproval(supabase: SupabaseClient<Database>, requestId: string): Promise<ApprovalReviewRow> {
  const request = await getRequestOrThrow(supabase, requestId);
  if (!request.current_package_id) {
    throw new DomainError("INVALID_STATE", "approval", "This request has no package to submit.");
  }
  await assertNoInjectedPersistenceFailure("approval_persistence_failure", "approval");
  const review = await submitPackageForReview(supabase, requestId, request.current_package_id);
  await bestEffort(() => notifyReviewerSubmission({ requestId, topic: request.topic }));
  return review;
}

export async function withdrawApproval(supabase: SupabaseClient<Database>, reviewId: string): Promise<ApprovalReviewRow> {
  const { data: reviewBefore } = await supabase.from("approval_reviews").select("request_id").eq("id", reviewId).single();
  const review = await withdrawPackageReview(supabase, reviewId);
  if (reviewBefore) {
    const request = await getRequestOrThrow(supabase, reviewBefore.request_id);
    await bestEffort(() => notifyReviewerWithdrawal({ requestId: request.id, topic: request.topic }));
  }
  return review;
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

export interface ReviewQueueCard {
  requestId: string;
  topic: string;
  submitterName: string;
  packageVersion: number;
  sourceCount: number;
  submittedAt: string;
  reviewId: string;
  comment: string | null;
}

export interface ReviewerQueue {
  awaitingReview: ReviewQueueCard[];
  changesRequested: ReviewQueueCard[];
  approved: ReviewQueueCard[];
}

async function toQueueCard(supabase: SupabaseClient<Database>, review: ApprovalReviewRow): Promise<ReviewQueueCard | null> {
  const { data: request } = await supabase.from("content_requests").select().eq("id", review.request_id).maybeSingle();
  if (!request) return null;
  const { data: pkg } = await supabase.from("content_packages").select().eq("id", review.package_id).maybeSingle();
  if (!pkg) return null;
  const { data: submitterProfile } = await supabase.from("profiles").select("display_name").eq("user_id", review.submitted_by).maybeSingle();
  const sources = await getSourceSetSources(supabase, pkg.source_set_version_id);

  return {
    requestId: request.id,
    topic: request.topic,
    submitterName: submitterProfile?.display_name ?? "Unknown",
    packageVersion: pkg.version_number,
    sourceCount: sources.length,
    submittedAt: review.submitted_at,
    reviewId: review.id,
    comment: review.comment,
  };
}

/**
 * Reviewer queue split into clearly separated tabs (SYSTEM-DESIGN-NEXTJS.md
 * §24, Task 17 Step 3). RLS already scopes visibility (any pending review,
 * or a review this reviewer has personally decided), so these queries only
 * need the status split, not an explicit reviewer filter.
 */
export async function getReviewerQueue(supabase: SupabaseClient<Database>): Promise<ReviewerQueue> {
  const [pending, changesRequested, approved] = await Promise.all([
    listPendingReviews(supabase),
    listDecidedReviews(supabase, "changes_requested"),
    listDecidedReviews(supabase, "approved"),
  ]);

  const [awaitingCards, changesCards, approvedCards] = await Promise.all([
    Promise.all(pending.map((r) => toQueueCard(supabase, r))),
    Promise.all(changesRequested.map((r) => toQueueCard(supabase, r))),
    Promise.all(approved.map((r) => toQueueCard(supabase, r))),
  ]);

  const notNull = (c: ReviewQueueCard | null): c is ReviewQueueCard => c !== null;
  return {
    awaitingReview: awaitingCards.filter(notNull),
    changesRequested: changesCards.filter(notNull),
    approved: approvedCards.filter(notNull),
  };
}

export interface PackageReviewContext {
  request: ContentRequestRow;
  review: ApprovalReviewRow;
  package: ContentPackageRow;
  evaluations: {
    article: EvaluationRow | null;
    linkedin: EvaluationRow | null;
    x: EvaluationRow | null;
    newsletter: EvaluationRow | null;
  };
  sources: ResearchSourceRow[];
  previousReviews: ApprovalReviewRow[];
}

/**
 * Loads everything the exact read-only review page needs
 * (SYSTEM-DESIGN-NEXTJS.md §24, Task 17 Step 4): the *exact* submitted
 * package and evaluations (by pinned ID, not "whatever is current now"),
 * the reviewed source set, and prior review cycles for this request so
 * "changes since last review" / previous feedback is visible.
 */
export async function getPackageReview(supabase: SupabaseClient<Database>, requestId: string): Promise<PackageReviewContext> {
  const request = await getRequestOrThrow(supabase, requestId);
  const review = await getLatestReview(supabase, requestId);
  if (!review) throw new DomainError("NOT_FOUND", "approval", "No review exists for this request.");

  const { data: pkg, error: pkgError } = await supabase.from("content_packages").select().eq("id", review.package_id).single();
  if (pkgError || !pkg) throw pkgError ?? new DomainError("NOT_FOUND", "approval", "Package not found.");

  const [article, linkedin, x, newsletter] = await Promise.all(
    [pkg.article_evaluation_id, pkg.linkedin_evaluation_id, pkg.x_evaluation_id, pkg.newsletter_evaluation_id].map(async (id) => {
      const { data } = await supabase.from("evaluations").select().eq("id", id).maybeSingle();
      return data ?? null;
    })
  );

  const sources = await getSourceSetSources(supabase, pkg.source_set_version_id);
  const previousReviews = (await listReviewsForRequest(supabase, requestId)).filter((r) => r.id !== review.id);

  return { request, review, package: pkg, evaluations: { article, linkedin, x, newsletter }, sources, previousReviews };
}
