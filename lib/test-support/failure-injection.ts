import "server-only";
import { cookies } from "next/headers";
import { DomainError } from "@/lib/domain/errors";

/**
 * Controlled failure fixtures (SYSTEM-DESIGN-NEXTJS.md §39). Never exposed
 * as a normal production feature — see isFailureInjectionEnabled() and the
 * route handler's gate for the full set of conditions that must all hold
 * before any of this can do anything.
 */
export const FAILURE_MODES = [
  "research_timeout",
  "source_retrieval_failure",
  "ai_generation_timeout",
  "malformed_ai_output",
  "ai_evaluation_failure",
  "delayed_ai_response",
  "approval_persistence_failure",
  "queue_persistence_failure",
  "notification_failure",
] as const;

export type FailureMode = (typeof FAILURE_MODES)[number];

export const FAILURE_MODE_COOKIE = "koya_test_failure";

/**
 * All three conditions must hold: not production, the feature flag on,
 * and (checked separately, at the route boundary, since it needs the
 * request) the shared-secret header. Never trust NODE_ENV alone.
 */
export function isFailureInjectionEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_FAILURE_INJECTION === "true";
}

export function isValidFailureMode(value: string): value is FailureMode {
  return (FAILURE_MODES as readonly string[]).includes(value);
}

/**
 * Reads the currently injected failure mode, if any. Returns null whenever
 * failure injection isn't enabled at all, regardless of what the cookie
 * contains — a stray cookie value can never activate a failure mode on its
 * own.
 */
export async function getInjectedFailureMode(): Promise<FailureMode | null> {
  if (!isFailureInjectionEnabled()) return null;

  let cookieStore;
  try {
    cookieStore = await cookies();
  } catch {
    // Called outside a Next.js request scope (e.g. a service function
    // exercised directly by an integration test, or a script). There is no
    // request-scoped cookie to read in that case, so no failure is injected
    // — this is not the production code path `cookies()` normally guards.
    return null;
  }

  const value = cookieStore.get(FAILURE_MODE_COOKIE)?.value;
  if (value && isValidFailureMode(value)) return value;
  return null;
}

/**
 * Throws before the real persistence call when the matching mode is
 * injected, simulating "the write to the database failed" for a flow that
 * has no natural provider layer to wrap (§39: approval/queue persistence
 * failure). `stage` names the DomainError stage for the caller's own error
 * handling/logging.
 */
export async function assertNoInjectedPersistenceFailure(mode: FailureMode, stage: string): Promise<void> {
  const injected = await getInjectedFailureMode();
  if (injected === mode) {
    throw new DomainError("VALIDATION_ERROR", stage, `Injected failure: ${mode}`, true);
  }
}
