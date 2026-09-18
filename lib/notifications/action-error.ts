import "server-only";
import { DomainError, type ActionError } from "@/lib/domain/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Runs a supplementary/best-effort side effect (logging, notification) and
 * swallows any failure. A logging or notification failure must never mask
 * or replace the original result of a successful business action
 * (SYSTEM-DESIGN-NEXTJS.md §26.3, §28.3).
 */
export async function bestEffort(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // Intentionally swallowed — see doc comment above.
  }
}

function isNextControlFlowError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && (digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_REDIRECT"));
}

/**
 * Central error boundary for server actions. Maps a DomainError into a safe,
 * typed ActionError with no side effects (it is an expected business
 * outcome, not an incident). Any other thrown value is treated as an
 * unexpected system incident: durably logged and reported to the system
 * errors Discord channel, both best-effort, then converted into a generic
 * safe message that never leaks internal error details to the client
 * (SYSTEM-DESIGN-NEXTJS.md §26.3, §28.1).
 */
export async function toLoggedActionError(
  error: unknown,
  stage: string,
  context: Record<string, unknown> = {}
): Promise<ActionError> {
  if (isNextControlFlowError(error)) {
    throw error;
  }

  if (error instanceof DomainError) {
    return { code: error.code, stage: error.stage, message: error.message, retrySafe: error.retrySafe };
  }

  const message = error instanceof Error ? error.message : String(error);

  await bestEffort(async () => {
    const admin = createSupabaseAdminClient();
    const { error: insertError } = await admin.from("error_logs").insert({
      request_id: typeof context.requestId === "string" ? context.requestId : null,
      stage,
      error_code: null,
      message,
      context: context as Json,
    });
    if (insertError) throw insertError;
  });


  return {
    code: "INTERNAL_ERROR",
    stage,
    message: "Something unexpected happened. The team has been notified.",
    retrySafe: false,
  };
}
