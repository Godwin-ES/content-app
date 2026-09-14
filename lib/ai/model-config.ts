import { DomainError } from "@/lib/domain/errors";
import type { AIModelChoice, AIProviderName } from "@/lib/domain/types";

const TEST_MODE_MODELS: AIModelChoice[] = ["gemini", "claude_haiku_4_5", "claude_sonnet_5"];

function isAITestModeEnabled(): boolean {
  return process.env.ENABLE_AI_TEST_MODE === "true";
}

/**
 * The production model is configured server-side only. Falls back to
 * claude_sonnet_5 if unset so the app never silently has zero allowed models.
 */
function getProductionModelChoice(): AIModelChoice {
  const configured = process.env.PRODUCTION_AI_MODEL;
  if (configured === "gemini" || configured === "claude_haiku_4_5" || configured === "claude_sonnet_5") {
    return configured;
  }
  return "claude_sonnet_5";
}

/**
 * Production safety boundary (SYSTEM-DESIGN-NEXTJS.md #4.9, #12.4): when AI test
 * mode is disabled, only the server-configured Claude production model is allowed
 * and the browser cannot override it.
 */
export function getAllowedAIModels(): AIModelChoice[] {
  if (isAITestModeEnabled()) {
    return TEST_MODE_MODELS;
  }
  return [getProductionModelChoice()];
}

export function assertAllowedAIModel(model: string): asserts model is AIModelChoice {
  const allowed = getAllowedAIModels();
  if (!allowed.includes(model as AIModelChoice)) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "model_selection",
      `Model "${model}" is not permitted. Allowed models: ${allowed.join(", ")}.`
    );
  }
}

export function providerForModel(model: AIModelChoice): AIProviderName {
  return model === "gemini" ? "google" : "anthropic";
}

/**
 * Maps an application model choice to the env-configured provider model id.
 * Model identifiers live server-side, not scattered through domain code
 * (SYSTEM-DESIGN-NEXTJS.md #12.1).
 */
export function resolveModelId(model: AIModelChoice): string {
  switch (model) {
    case "gemini":
      return requireEnv("GOOGLE_GEMINI_MODEL");
    case "claude_haiku_4_5":
      return requireEnv("ANTHROPIC_HAIKU_MODEL");
    case "claude_sonnet_5":
      return requireEnv("ANTHROPIC_SONNET_MODEL");
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new DomainError(
      "CONFIGURATION_ERROR",
      "model_selection",
      `Missing required environment variable ${name}.`
    );
  }
  return value;
}
