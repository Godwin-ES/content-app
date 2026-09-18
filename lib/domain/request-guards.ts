import { DomainError } from "@/lib/domain/errors";

/**
 * A request in the bin is not a workspace. Restoring it is one click, so
 * refusing the edit and saying why is better than letting work accumulate
 * on something scheduled for deletion.
 *
 * This guard used to protect a package "pending review" from being edited
 * out from under the Reviewer. There is no pending state and no Reviewer:
 * an approved package is protected by immutability instead — editing
 * creates a new version and returns the request to development, leaving
 * the approved one untouched as history.
 *
 * Shared by the article, channel, and package services so the rule cannot
 * be bypassed from any one surface.
 */
export function assertContentEditable(request: { status: string; deleted_at?: string | null }): void {
  if (request.deleted_at) {
    throw new DomainError(
      "INVALID_STATE",
      "content_editing",
      "This request is in the bin. Restore it before making further changes."
    );
  }
}
