import "server-only";
import { DomainError } from "@/lib/domain/errors";
import type { AIProvider, GenerateStructuredInput } from "@/lib/ai/types";
import type { ResearchProvider, SearchResultItem, RetrievalOutcome } from "@/lib/research/types";
import type { FailureMode } from "@/lib/test-support/failure-injection";

const DELAYED_RESPONSE_MS = 6000;

/**
 * Wraps a real (or fake) AIProvider to simulate one dev-only failure mode
 * (SYSTEM-DESIGN-NEXTJS.md §39). `ai_generation_timeout` and
 * `ai_evaluation_failure` both manifest identically here — as the next AI
 * call failing — since which business flow that affects depends on which
 * button the tester clicks (Generate vs. Evaluate), not on anything this
 * provider-level wrapper can distinguish.
 */
export class FailureInjectingAIProvider implements AIProvider {
  constructor(
    private readonly inner: AIProvider,
    private readonly mode: FailureMode
  ) {}

  async generateStructured<T>(input: GenerateStructuredInput<T>): Promise<T> {
    if (this.mode === "ai_generation_timeout" || this.mode === "ai_evaluation_failure") {
      throw new DomainError("VALIDATION_ERROR", "ai_provider", `Injected failure: ${this.mode}`, true);
    }
    if (this.mode === "malformed_ai_output") {
      const parsed = input.schema.safeParse({ __koya_injected_malformed_output__: true });
      throw new DomainError(
        "VALIDATION_ERROR",
        "ai_provider",
        `Injected malformed output: ${parsed.success ? "unexpectedly parsed as valid" : parsed.error.message}`
      );
    }
    if (this.mode === "delayed_ai_response") {
      await new Promise((resolve) => setTimeout(resolve, DELAYED_RESPONSE_MS));
    }
    return this.inner.generateStructured(input);
  }
}

/**
 * Wraps a real (or fake) ResearchProvider to simulate one dev-only
 * research failure mode (SYSTEM-DESIGN-NEXTJS.md §39).
 */
export class FailureInjectingResearchProvider implements ResearchProvider {
  constructor(
    private readonly inner: ResearchProvider,
    private readonly mode: FailureMode
  ) {}

  async search(query: string, limit: number): Promise<SearchResultItem[]> {
    if (this.mode === "research_timeout") {
      throw new DomainError("VALIDATION_ERROR", "research_provider", "Injected failure: research_timeout", true);
    }
    return this.inner.search(query, limit);
  }

  async retrieve(url: string): Promise<RetrievalOutcome> {
    if (this.mode === "source_retrieval_failure") {
      return { status: "failed", reason: "Injected failure: source_retrieval_failure", retrySafe: true };
    }
    return this.inner.retrieve(url);
  }
}

const AI_MODES = new Set<FailureMode>(["ai_generation_timeout", "ai_evaluation_failure", "malformed_ai_output", "delayed_ai_response"]);
const RESEARCH_MODES = new Set<FailureMode>(["research_timeout", "source_retrieval_failure"]);

export function applyAIFailureInjection(provider: AIProvider, mode: FailureMode | null): AIProvider {
  if (mode && AI_MODES.has(mode)) return new FailureInjectingAIProvider(provider, mode);
  return provider;
}

export function applyResearchFailureInjection(provider: ResearchProvider, mode: FailureMode | null): ResearchProvider {
  if (mode && RESEARCH_MODES.has(mode)) return new FailureInjectingResearchProvider(provider, mode);
  return provider;
}
