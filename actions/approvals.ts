"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import { approveCurrentPackage } from "@/lib/approvals/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";

type PackageApprovalRow = Database["public"]["Tables"]["package_approvals"]["Row"];

/**
 * Approves the request's current package for publishing. One action,
 * because there is one person: the submit step it used to need existed
 * only to hand the package to someone else.
 */
export async function approvePackageAction(requestId: string): Promise<ActionResult<PackageApprovalRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    const approval = await approveCurrentPackage(supabase, requestId);
    return { ok: true, data: approval };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "approve_package", { requestId });
    return { ok: false, error: actionError };
  }
}
