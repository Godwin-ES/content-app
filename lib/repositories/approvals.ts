import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { throwFromRpcError } from "@/lib/supabase/rpc";
import type { ReviewDecision } from "@/lib/domain/types";

type ApprovalReviewRow = Database["public"]["Tables"]["approval_reviews"]["Row"];

export async function getLatestReview(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<ApprovalReviewRow | null> {
  const { data, error } = await supabase
    .from("approval_reviews")
    .select()
    .eq("request_id", requestId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listReviewsForRequest(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<ApprovalReviewRow[]> {
  const { data, error } = await supabase
    .from("approval_reviews")
    .select()
    .eq("request_id", requestId)
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listPendingReviews(supabase: SupabaseClient<Database>): Promise<ApprovalReviewRow[]> {
  const { data, error } = await supabase.from("approval_reviews").select().eq("status", "pending");
  if (error) throw error;
  return data ?? [];
}

export async function listDecidedReviews(
  supabase: SupabaseClient<Database>,
  status: ReviewDecision
): Promise<ApprovalReviewRow[]> {
  const { data, error } = await supabase
    .from("approval_reviews")
    .select()
    .eq("status", status)
    .order("decided_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function submitPackageForReview(
  supabase: SupabaseClient<Database>,
  requestId: string,
  packageId: string
): Promise<ApprovalReviewRow> {
  const { data, error } = await supabase.rpc("submit_package_for_review", { p_request_id: requestId, p_package_id: packageId });
  if (error) throwFromRpcError(error, "submit_for_approval");
  if (!data) throw new Error("submit_package_for_review returned no data");
  return data;
}

export async function withdrawPackageReview(
  supabase: SupabaseClient<Database>,
  reviewId: string
): Promise<ApprovalReviewRow> {
  const { data, error } = await supabase.rpc("withdraw_package_review", { p_review_id: reviewId });
  if (error) throwFromRpcError(error, "withdraw_approval");
  if (!data) throw new Error("withdraw_package_review returned no data");
  return data;
}

export async function decidePackageReview(
  supabase: SupabaseClient<Database>,
  params: { reviewId: string; packageId: string; decision: ReviewDecision; comment: string | null }
): Promise<ApprovalReviewRow> {
  const { data, error } = await supabase.rpc("decide_package_review", {
    p_review_id: params.reviewId,
    p_package_id: params.packageId,
    p_decision: params.decision,
    p_comment: params.comment ?? undefined,
  });
  if (error) throwFromRpcError(error, "decide_approval");
  if (!data) throw new Error("decide_package_review returned no data");
  return data;
}
