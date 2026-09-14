import "server-only";
import { DomainError } from "@/lib/domain/errors";
import { providerForModel, resolveModelId } from "@/lib/ai/model-config";
import type { AIModelChoice } from "@/lib/domain/types";
import type { AIProvider } from "@/lib/ai/types";
import { AnthropicAIProvider } from "@/lib/ai/providers/anthropic";
import { GoogleAIProvider } from "@/lib/ai/providers/google";
import { FakeAIProvider } from "@/lib/ai/providers/fake";

let fakeProviderSingleton: FakeAIProvider | null = null;

/**
 * Test-only escape hatch for deterministic E2E/CI runs (SYSTEM-DESIGN-NEXTJS.md §20,
 * Task 20 Step 2). Refuses to activate outside a non-production environment
 * so a misconfigured deploy can never silently serve fabricated content.
 */
function getFakeProvider(): FakeAIProvider {
  if (process.env.NODE_ENV === "production") {
    throw new DomainError("CONFIGURATION_ERROR", "ai_provider", "Fake AI providers cannot be used in production.");
  }
  if (!fakeProviderSingleton) {
    fakeProviderSingleton = new FakeAIProvider();
  }
  return fakeProviderSingleton;
}

/**
 * Resolves the application's chosen model label to a live provider adapter.
 * Model identifiers are read from server-side env config only
 * (SYSTEM-DESIGN-NEXTJS.md §12.1); callers never pass a raw provider model
 * string here, only the enumerated AIModelChoice.
 */
export function getAIProvider(model: AIModelChoice): AIProvider {
  if (process.env.USE_FAKE_PROVIDERS === "true") {
    return getFakeProvider();
  }
  const providerName = providerForModel(model);
  return providerName === "google" ? new GoogleAIProvider() : new AnthropicAIProvider();
}

export function getModelIdFor(model: AIModelChoice): string {
  if (process.env.USE_FAKE_PROVIDERS === "true") {
    return `fake:${model}`;
  }
  return resolveModelId(model);
}
