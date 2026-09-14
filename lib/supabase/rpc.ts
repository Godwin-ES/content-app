import { DomainError } from "@/lib/domain/errors";

/**
 * Business RPCs (008_business_rpcs.sql) raise exceptions as `"CODE: message"`
 * so this layer can translate them into the typed DomainError contract
 * without parsing arbitrary Postgres error text. An error whose code is not
 * one of ours is left unrecognized (returns null) so the caller's normal
 * unexpected-error handling (toLoggedActionError) treats it as a genuine
 * system incident rather than silently downgrading it to an expected one.
 */
const KNOWN_DOMAIN_ERROR_CODES = new Set([
  "VALIDATION_ERROR",
  "PERMISSION_DENIED",
  "INVALID_STATE",
  "STALE_VERSION",
  "APPROVAL_REQUIRED",
  "DUPLICATE_QUEUE_ITEM",
  "NOT_FOUND",
  "SELF_APPROVAL",
  "CONFIGURATION_ERROR",
]);

export function domainErrorFromRpcMessage(message: string, stage: string): DomainError | null {
  const match = /^([A-Z_]+):\s*([\s\S]*)$/.exec(message);
  if (match && KNOWN_DOMAIN_ERROR_CODES.has(match[1])) {
    return new DomainError(match[1], stage, match[2]);
  }
  return null;
}

/**
 * Throws a translated DomainError for a recognized RPC error, or the
 * original error message wrapped in a plain Error for anything else.
 */
export function throwFromRpcError(error: { message: string }, stage: string): never {
  throw domainErrorFromRpcMessage(error.message, stage) ?? new Error(error.message);
}
