"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import {
  createContentRequest,
  deleteRequest,
  restoreRequest,
  purgeRequest,
  listDeletedRequests,
  setSuppliedSourcesOnly,
} from "@/lib/repositories/requests";
import { uploadSupportingMaterial } from "@/lib/materials/service";
import { addPendingSourceUrl } from "@/lib/research/service";
import { parseUserSuppliedUrl } from "@/lib/research/url";
import { blockingIntakeFlags } from "@/lib/domain/intake-checks";
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

    // The primary keyword and the call to action are absent on purpose:
    // the content planner derives both from the accepted evidence, which
    // is the only place either can be grounded.
    const rawInput = {
      topic: String(formData.get("topic") ?? ""),
      audience: emptyToUndefined(formData.get("audience")),
      objective: emptyToUndefined(formData.get("objective")),
      tone: emptyToUndefined(formData.get("tone")),
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


    // Re-checked here, not only in reviewIntakeAction: a check that lives
    // solely in an action the client chooses to call is not a check. Only
    // the blocking ones — everything else is advisory by design and the
    // writer may have deliberately overridden it.
    const blocking = blockingIntakeFlags(rawInput);
    if (blocking.length > 0) {
      throw new DomainError("VALIDATION_ERROR", "create_content_request", blocking[0].message);
    }

    const request = await createContentRequest(supabase, user.userId, rawInput);

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
 * Moves a request to the bin, reversibly. `delete_request` re-checks
 * ownership, cancels any queued publishing items, and sweeps anything past
 * the 30-day window while it is there.
 */
export async function deleteRequestAction(requestId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    await deleteRequest(supabase, requestId);
    revalidatePath("/dashboard");
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "delete_request", { requestId });
    return { ok: false, error: actionError };
  }
}

/** Brings a request back out of the bin. */
export async function restoreRequestAction(requestId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    await restoreRequest(supabase, requestId);
    revalidatePath("/dashboard");
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "restore_request", { requestId });
    return { ok: false, error: actionError };
  }
}

/**
 * Removes one binned request for good, without waiting out its thirty
 * days. The RPC refuses anything that is not already in the bin, so this
 * is always the second of two deliberate steps rather than a way to
 * destroy live work in one click.
 */
export async function purgeRequestAction(requestId: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    await purgeRequest(supabase, requestId);
    revalidatePath("/dashboard");
    return { ok: true, data: null };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "purge_request", { requestId });
    return { ok: false, error: actionError };
  }
}

/**
 * Empties the bin, or restores all of it.
 *
 * Both walk the same list the bin is rendered from, one request at a time,
 * and report how many they got through. Sequential rather than concurrent
 * on purpose: purging touches provenance rows in an order that matters,
 * and a handful of requests is not worth racing.
 *
 * A single failure does not abort the rest — emptying a bin of twelve and
 * stopping on the third leaves someone to work out which three went.
 */
async function forEachDeletedRequest(
  stage: "purge_all_requests" | "restore_all_requests",
  act: (supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, requestId: string) => Promise<void>
): Promise<ActionResult<{ done: number; failed: number }>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireSignedIn(supabase);
    const deleted = await listDeletedRequests(supabase, user.userId);

    let done = 0;
    let failed = 0;
    for (const request of deleted) {
      try {
        await act(supabase, request.id);
        done++;
      } catch {
        failed++;
      }
    }

    revalidatePath("/dashboard");
    return { ok: true, data: { done, failed } };
  } catch (error) {
    const actionError = await toLoggedActionError(error, stage, {});
    return { ok: false, error: actionError };
  }
}

export async function purgeAllDeletedRequestsAction(): Promise<ActionResult<{ done: number; failed: number }>> {
  return forEachDeletedRequest("purge_all_requests", purgeRequest);
}

export async function restoreAllDeletedRequestsAction(): Promise<ActionResult<{ done: number; failed: number }>> {
  return forEachDeletedRequest("restore_all_requests", restoreRequest);
}

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

