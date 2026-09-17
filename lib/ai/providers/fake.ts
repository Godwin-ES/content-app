import { DomainError } from "@/lib/domain/errors";
import type { AIProvider, GenerateStructuredInput } from "@/lib/ai/types";

/**
 * Deterministic test double (SYSTEM-DESIGN-NEXTJS.md §20 Task list, §36.2).
 * Tests queue canned responses in call order; each is still validated
 * against the requested schema, so a test fixture with the wrong shape
 * fails the same way a real provider's malformed output would.
 */
export class FakeAIProvider implements AIProvider {
  private queue: unknown[];

  constructor(responses: unknown[] = []) {
    this.queue = [...responses];
  }

  enqueue(response: unknown): void {
    this.queue.push(response);
  }

  async generateStructured<T>({ schema }: GenerateStructuredInput<T>): Promise<T> {
    if (this.queue.length === 0) {
      // Reached from the running app, not a test, whenever
      // USE_FAKE_PROVIDERS=true: every AI call is routed to this stub, and
      // nothing has queued a response for it. The message says so, because
      // "no queued response" on its own reads like an application fault
      // rather than a setting that needs changing.
      throw new DomainError(
        "VALIDATION_ERROR",
        "ai_provider",
        "No AI provider is configured: USE_FAKE_PROVIDERS is enabled, which routes every AI call to the test stub. " +
          "Set USE_FAKE_PROVIDERS=false in .env.local and restart the dev server to use a real model."
      );
    }
    const next = this.queue.shift();
    const parsed = schema.safeParse(next);
    if (!parsed.success) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "ai_provider",
        `Fake provider response did not match the required schema: ${parsed.error.message}`
      );
    }
    return parsed.data;
  }
}
