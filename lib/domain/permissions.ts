import type { UserRole } from "@/lib/domain/types";

/**
 * Two business roles only (SYSTEM-DESIGN-NEXTJS.md #4.2). Content Managers own
 * requests, sources, drafts, channels, packages, and publishing. Reviewers make
 * review decisions only; they never write submitted content.
 */
export function isContentManager(role: UserRole): boolean {
  return role === "content_manager";
}

export function isReviewer(role: UserRole): boolean {
  return role === "reviewer";
}

/**
 * A Content Manager can never approve their own package (SYSTEM-DESIGN-NEXTJS.md #4.2, #24.3).
 * This is a UI-level convenience check; the authoritative enforcement lives in the
 * `decide_package_review` database RPC (Task 3).
 */
export function canDecideReview(reviewerId: string, submittedById: string): boolean {
  return reviewerId !== submittedById;
}
