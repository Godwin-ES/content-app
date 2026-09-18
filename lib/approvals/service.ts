import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { bestEffort } from "@/lib/notifications/action-error";
import { notifyPackageApproved } from "@/lib/notifications/service";
import { approvePackage } from "@/lib/repositories/approvals";

type PackageApprovalRow = Database["public"]["Tables"]["package_approvals"]["Row"];
type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];

/**
 * RLS scopes this to requests the caller owns, so "no row" and "someone
 * else's request" are the same lookup. Mapped to a DomainError rather than
 * rethrown, so the caller sees a sentence instead of a PostgREST code.
 */
async function getRequestOrThrow(supabase: SupabaseClient<Database>, requestId: string): Promise<ContentRequestRow> {
  const { data } = await supabase.from("content_requests").select().eq("id", requestId).maybeSingle();
  if (!data) throw new DomainError("NOT_FOUND", "approval", "Request not found.");
  return data;
}

/**
 * The approval gate, in one act.
 *
 * It used to take two: submit the package, then decide on it. That shape
 * existed to move work between two people, and with one account it meant
 * handing the package to yourself — a button whose only effect was to make
 * the next button appear.
 *
 * What is deliberately not collapsed is the gate itself. Nothing can be
 * queued for publishing until a human has looked at a specific package
 * version and approved it, and that approval is recorded against that
 * version with its author and timestamp — the evidence the gate was
 * honoured. There is no "request changes" counterpart, because rejecting
 * your own work is just editing it: any edit creates a new version, which
 * returns the request to development on its own.
 *
 * The notification is best-effort: a Discord delivery failure must never
 * block or roll back an otherwise-successful approval
 * (SYSTEM-DESIGN-NEXTJS.md §26.3, §28.3).
 */
export async function approveCurrentPackage(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<PackageApprovalRow> {
  const request = await getRequestOrThrow(supabase, requestId);
  if (!request.current_package_id) {
    throw new DomainError("INVALID_STATE", "approval", "This request has no package to approve.");
  }

  const approval = await approvePackage(supabase, requestId, request.current_package_id);
  await bestEffort(() => notifyPackageApproved({ requestId, topic: request.topic }));
  return approval;
}
