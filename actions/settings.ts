"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import { setDisplayName } from "@/lib/repositories/settings";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";

export async function setDisplayNameAction(displayName: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    await setDisplayName(supabase, displayName);
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: await toLoggedActionError(error, "settings") };
  }
}
