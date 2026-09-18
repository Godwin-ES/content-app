import { DomainError } from "@/lib/domain/errors";
import type { AIModelChoice, AIProviderName } from "@/lib/domain/types";

const SELECTABLE_MODELS: AIModelChoice[] = ["gemini", "claude_haiku_4_5", "claude_sonnet_5"];

/**
 * The model a request uses when it does not pick one (PRODUCTION_AI_MODEL).
 * Falls back to claude_sonnet_5 if unset, so the app always has a model.
 */
export function getDefaultAIModel(): AIModelChoice {
  const configured = process.env.PRODUCTION_AI_MODEL;
  if (configured === "gemini" || configured === "claude_haiku_4_5" || configured === "claude_sonnet_5") {
    return configured;
  }
  return "claude_sonnet_5";
}

/**
 * Which models a request may be created with.
 *
 * This used to be gated on a deployment flag, so that a browser could not
 * choose an expensive model in production. One account owns the workspace
 * and the API keys it spends, so that protection was protecting them from
 * themselves. The server still re-validates every choice against this
 * list, which is what stops an arbitrary model id being posted.
 */
export function getAllowedAIModels(): AIModelChoice[] {
  return SELECTABLE_MODELS;
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
