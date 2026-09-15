import { DomainError } from "@/lib/domain/errors";

/**
 * A submitted package is read-only for the duration of its review
 * (SYSTEM-DESIGN-NEXTJS.md §24.1, §24.3): the Content Manager must
 * withdraw the pending review before generating, revising, or manually
 * editing article/channel content again. Shared by the article and
 * channel services so the rule can't be bypassed from either surface.
 */
export function assertContentEditable(request: { status: string }): void {
  if (request.status === "pending_approval") {
    throw new DomainError(
      "INVALID_STATE",
      "content_editing",
      "This request's package is pending review. Withdraw the review before making further changes."
    );
  }
}
