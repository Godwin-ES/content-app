"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import { getPackageReadiness, createContentPackage, type PackageReadiness } from "@/lib/packages/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";

type ContentPackageRow = Database["public"]["Tables"]["content_packages"]["Row"];

export async function getPackageReadinessAction(requestId: string): Promise<ActionResult<PackageReadiness>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    const readiness = await getPackageReadiness(supabase, requestId);
    return { ok: true, data: readiness };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "get_package_readiness", { requestId });
    return { ok: false, error: actionError };
  }
}

export async function createContentPackageAction(requestId: string): Promise<ActionResult<ContentPackageRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    const pkg = await createContentPackage(supabase, requestId);
    return { ok: true, data: pkg };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "create_content_package", { requestId });
    return { ok: false, error: actionError };
  }
}
