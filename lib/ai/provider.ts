import "server-only";
import { DomainError } from "@/lib/domain/errors";
import type { AIProvider } from "@/lib/ai/types";
import { AnthropicAIProvider } from "@/lib/ai/providers/anthropic";

/**
 * The model every generation runs on, configured server-side only.
 *
 * There used to be three, chosen per request. Model identifiers and what
 * they cost are a deployment decision, not a per-request one, and the
 * choice never earned the machinery it took to offer it: an enum, an
 * allow-list, a column, a selector, and a second provider adapter.
 */
export function getModelId(): string {
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    throw new DomainError("CONFIGURATION_ERROR", "ai_provider", "Missing required environment variable ANTHROPIC_MODEL.");
  }
  return model;
}

export async function getAIProvider(): Promise<AIProvider> {
  return new AnthropicAIProvider();
}
