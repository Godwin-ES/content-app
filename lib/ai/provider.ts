import "server-only";
import { DomainError } from "@/lib/domain/errors";
import { providerForModel, resolveModelId, getAllowedAIModels } from "@/lib/ai/model-config";
import type { AIModelChoice } from "@/lib/domain/types";
import type { AIProvider } from "@/lib/ai/types";
import { AnthropicAIProvider } from "@/lib/ai/providers/anthropic";
import { GoogleAIProvider } from "@/lib/ai/providers/google";
import { FakeAIProvider } from "@/lib/ai/providers/fake";
import { getInjectedFailureMode } from "@/lib/test-support/failure-injection";
import { applyAIFailureInjection } from "@/lib/test-support/injected-providers";

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
export async function getAIProvider(model: AIModelChoice): Promise<AIProvider> {
  const base =
    process.env.USE_FAKE_PROVIDERS === "true"
      ? getFakeProvider()
      : providerForModel(model) === "google"
        ? new GoogleAIProvider()
        : new AnthropicAIProvider();

  const failureMode = await getInjectedFailureMode();
  return applyAIFailureInjection(base, failureMode);
}

/**
 * A request's chosen model applies only while AI test mode is enabled and
 * only if it is still an allowed choice; otherwise the configured
 * production model is used (SYSTEM-DESIGN-NEXTJS.md §4.9, §12.4). The
 * browser cannot influence this outside test mode.
 */
export function resolveAIModelForRequest(request: { test_model_choice: string | null }): AIModelChoice {
  const allowed = getAllowedAIModels();
  if (process.env.ENABLE_AI_TEST_MODE === "true" && request.test_model_choice) {
    const choice = request.test_model_choice as AIModelChoice;
    if (allowed.includes(choice)) return choice;
  }
  return allowed[0];
}

export function getModelIdFor(model: AIModelChoice): string {
  if (process.env.USE_FAKE_PROVIDERS === "true") {
    return `fake:${model}`;
  }
  return resolveModelId(model);
}
