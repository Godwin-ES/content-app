"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import {
  createContentRequest,
  deleteRequest,
  setRequestPrimaryKeyword,
  setRequestCta,
  setSuppliedSourcesOnly,
} from "@/lib/repositories/requests";
import { uploadSupportingMaterial } from "@/lib/materials/service";
import { addPendingSourceUrl } from "@/lib/research/service";
import { parseUserSuppliedUrl } from "@/lib/research/url";
import { DomainError } from "@/lib/domain/errors";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";

export async function createContentRequestAction(
  _prevState: ActionResult<{ requestId: string }> | null,
  formData: FormData
): Promise<ActionResult<{ requestId: string }>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireSignedIn(supabase);

    // Primary keyword and CTA are optional intake context again. Both are
    // still derived when left blank — the keyword from the research plan,
    // the CTA by the writer — but someone who is targeting a specific
    // keyword or has a campaign CTA to hit had no way to say so, and
    // steering it afterwards meant regenerating work that was already
    // written around the wrong one.
    //
    // Additional instructions stays out: it was dropped as an intake
    // concept entirely, not merely hidden.
    const rawInput = {
      topic: String(formData.get("topic") ?? ""),
      audience: emptyToUndefined(formData.get("audience")),
      objective: emptyToUndefined(formData.get("objective")),
      tone: emptyToUndefined(formData.get("tone")),
      primaryKeyword: emptyToUndefined(formData.get("primaryKeyword")),
      cta: emptyToUndefined(formData.get("cta")),
      sourceUrls: [],
    };

    // URLs arrive as one entry per link from the Add URL control. They are
    // validated before anything is written, so an unusable link fails the
    // submission outright rather than leaving a half-populated request
    // behind that the Content Manager then has to clean up.
    const submittedUrls = formData.getAll("sourceUrls").filter((v): v is string => typeof v === "string");
    const normalizedUrls: string[] = [];
    for (const raw of submittedUrls) {
      const normalized = parseUserSuppliedUrl(raw);
      if (!normalized) {
        throw new DomainError("VALIDATION_ERROR", "create_content_request", `"${raw}" is not a valid web address.`);
      }
      if (!normalizedUrls.includes(normalized)) normalizedUrls.push(normalized);
    }

    const files = formData.getAll("materials").filter((v): v is File => v instanceof File && v.size > 0);

    const aiModelChoice = emptyToUndefined(formData.get("aiModelChoice"));

    const request = await createContentRequest(supabase, user.userId, rawInput, aiModelChoice);

    // Attached after the request exists, since both need its id. An upload
    // that fails validation (unsupported type, too large) must not discard
    // the request or the attachments that did work, so each is reported
    // rather than thrown — a file whose text cannot be read still lands in
    // the source list as a failed source, with the reason attached.
    const attachmentErrors: string[] = [];
    for (const file of files) {
      try {
        await uploadSupportingMaterial(supabase, {
          requestId: request.id,
          ownerId: user.userId,
          filename: file.name,
          mimeType: file.type,
          buffer: Buffer.from(await file.arrayBuffer()),
        });
      } catch (error) {
        attachmentErrors.push(`${file.name}: ${error instanceof DomainError ? error.message : "could not be uploaded."}`);
      }
    }
    for (const url of normalizedUrls) {
      try {
        await addPendingSourceUrl(supabase, request.id, url);
      } catch (error) {
        attachmentErrors.push(`${url}: ${error instanceof DomainError ? error.message : "could not be added."}`);
      }
    }

    if (attachmentErrors.length > 0) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          stage: "create_content_request",
          message: `The request was created, but some attachments could not be added — open it and add them again:\n${attachmentErrors.join("\n")}`,
          retrySafe: false,
        },
      };
    }

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
 * Deletes a request outright. `delete_request` re-checks ownership and
 * refuses once a decision has been recorded, so this is a real
 * server-enforced rule rather than a UI affordance that happens to be
 * hidden at the right moments.
 */
export async function deleteRequestAction(requestId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    await deleteRequest(supabase, requestId);
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "delete_request", { requestId });
    return { ok: false, error: actionError };
  }
}

/**
 * Whether research should stay strictly inside the supplied materials and
 * URLs instead of also searching the web. It lives with the sources it
 * governs on the Research tab rather than at intake, where it had to be
 * decided before the Content Manager had seen a single source, and it is
 * only changeable while the request is still a draft — once research has
 * run, the source set it produced is what the rest of the pipeline is
 * built on. The draft check lives in the RPC, not here, so it holds
 * regardless of which caller reaches it.
 */
export async function setSuppliedSourcesOnlyAction(requestId: string, value: boolean): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    await setSuppliedSourcesOnly(supabase, requestId, value);
    revalidatePath(`/requests/${requestId}`);
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "update_request", { requestId });
    return { ok: false, error: actionError };
  }
}

/**
 * Changes the keyword the article targets. Editable on the Research tab
 * because that is where the keyword's consequences are visible — it steers
 * the search queries, the content plan, and the deterministic SEO checks —
 * and because before this the only way to correct a derived keyword was to
 * throw the request away and start again.
 */
export async function setPrimaryKeywordAction(requestId: string, primaryKeyword: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    await setRequestPrimaryKeyword(supabase, requestId, primaryKeyword.trim() || null);
    revalidatePath(`/requests/${requestId}`);
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "update_request", { requestId });
    return { ok: false, error: actionError };
  }
}

/**
 * Changes the call to action every channel asset adapts. Editable on the
 * Channels tab, where the posts that carry it are.
 *
 * Changing it does not rewrite anything already generated — the existing
 * assets keep the CTA they were written with until they are regenerated,
 * which is the same rule the rest of the pipeline follows.
 */
export async function setCtaAction(requestId: string, cta: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    await setRequestCta(supabase, requestId, cta.trim() || null);
    revalidatePath(`/requests/${requestId}`);
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "update_request", { requestId });
    return { ok: false, error: actionError };
  }
}
