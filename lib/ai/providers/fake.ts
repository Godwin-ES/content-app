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
      throw new DomainError("VALIDATION_ERROR", "ai_provider", "FakeAIProvider has no queued response for this call.");
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
