"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { createContentRequest } from "@/lib/repositories/requests";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";

export async function createContentRequestAction(
  _prevState: ActionResult<{ requestId: string }> | null,
  formData: FormData
): Promise<ActionResult<{ requestId: string }>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireContentManager(supabase);

    const rawInput = {
      topic: String(formData.get("topic") ?? ""),
      audience: emptyToUndefined(formData.get("audience")),
      objective: emptyToUndefined(formData.get("objective")),
      tone: emptyToUndefined(formData.get("tone")),
      cta: emptyToUndefined(formData.get("cta")),
      primaryKeyword: emptyToUndefined(formData.get("primaryKeyword")),
      additionalInstructions: emptyToUndefined(formData.get("additionalInstructions")),
      publicationDate: emptyToUndefined(formData.get("publicationDate")),
      sourceUrls: String(formData.get("sourceUrls") ?? "")
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
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
