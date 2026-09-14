/**
 * Stable error type for expected business/domain outcomes (validation, permission,
 * stale-state, etc.). Distinguished from unexpected system incidents so that
 * centralized error handling (Task 4) can decide what gets logged/alerted versus
 * handled cleanly in-app (SYSTEM-DESIGN-NEXTJS.md #26.3).
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly stage: string,
    message: string,
    public readonly retrySafe = false
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * The safe, serializable shape a server action returns to the client after
 * an error — never the raw thrown value, which may carry internal detail.
 */
export interface ActionError {
  code: string;
  stage: string;
  message: string;
  retrySafe: boolean;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };
