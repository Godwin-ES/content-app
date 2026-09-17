"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { createContentRequest, deleteRequest } from "@/lib/repositories/requests";
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
 * refuses once a Reviewer has left feedback, so this is a real
 * server-enforced rule rather than a UI affordance that happens to be
 * hidden at the right moments.
 */
export async function deleteRequestAction(requestId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
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
 * built on.
 */
export async function setSuppliedSourcesOnlyAction(requestId: string, value: boolean): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);

    const { data: request, error: readError } = await supabase
      .from("content_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    if (readError || !request) throw readError ?? new DomainError("NOT_FOUND", "update_request", "Request not found.");
    if (request.status !== "draft") {
      throw new DomainError("INVALID_STATE", "update_request", "Research has already started, so this can no longer be changed.");
    }

    const { error } = await supabase.from("content_requests").update({ supplied_sources_only: value }).eq("id", requestId);
    if (error) throw error;

    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "update_request", { requestId });
    return { ok: false, error: actionError };
  }
}
