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
    /**
     * The first queued response that fits the schema being asked for,
     * rather than strictly the next one.
     *
     * A strict queue assumes a step makes a known number of calls in a
     * known order. Article generation stopped satisfying either: it writes
     * the title and every section as separate concurrent calls, and three
     * options run concurrently on top of that, so "call 4" is not a fixed
     * thing any more. Matching on shape lets a test say what the model
     * returns without also having to predict when it is asked.
     *
     * A response matching nothing is still consumed in order, because a
     * deliberately malformed fixture is the point of the test that queues
     * it — skipping it would quietly turn a failure case into a pass.
     */
    const matchIndex = this.queue.findIndex((response) => schema.safeParse(response).success);
    const next = this.queue.splice(matchIndex >= 0 ? matchIndex : 0, 1)[0];
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
