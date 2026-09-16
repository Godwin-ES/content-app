"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { createContentRequest, deleteDraftRequest } from "@/lib/repositories/requests";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";

export async function createContentRequestAction(
  _prevState: ActionResult<{ requestId: string }> | null,
  formData: FormData
): Promise<ActionResult<{ requestId: string }>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireContentManager(supabase);

    // CTA, primary keyword, and additional instructions are no longer
    // collected at intake (Phase 1 scope reduction): CTA and primary
    // keyword are always AI-derived, and additional instructions was
    // dropped as an intake concept entirely. Their underlying resolution
    // logic (lib/domain/defaults.ts) already treats them as optional, so
    // simply never reading them from formData here is enough — a request
    // can never carry a supplied value for any of the three again.
    const rawInput = {
      topic: String(formData.get("topic") ?? ""),
      audience: emptyToUndefined(formData.get("audience")),
      objective: emptyToUndefined(formData.get("objective")),
      tone: emptyToUndefined(formData.get("tone")),
      publicationDate: emptyToUndefined(formData.get("publicationDate")),
      sourceUrls: String(formData.get("sourceUrls") ?? "")
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      suppliedSourcesOnly: formData.get("suppliedSourcesOnly") === "on",
    };

    const aiModelChoice = emptyToUndefined(formData.get("aiModelChoice"));

    const request = await createContentRequest(supabase, user.userId, rawInput, aiModelChoice);

    redirect(`/requests/${request.id}`);
  } catch (error) {
    const actionError = await toLoggedActionError(error, "create_content_request");
    return { ok: false, error: actionError };
  }
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = typeof value === "string" ? value.trim() : "";
  return str.length > 0 ? str : undefined;
}

/**
 * Deletes a request outright — only ever possible in `draft`, before
 * anything downstream exists to lose. `delete_draft_request` re-checks
 * ownership and status itself, so this is a real server-enforced rule, not
 * just a UI affordance that happens to be hidden past draft.
 */
export async function deleteRequestAction(requestId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    await deleteDraftRequest(supabase, requestId);
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "delete_request", { requestId });
    return { ok: false, error: actionError };
  }
}
