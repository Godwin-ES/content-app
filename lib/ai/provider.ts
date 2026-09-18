import "server-only";
import { DomainError } from "@/lib/domain/errors";
import type { AIProvider } from "@/lib/ai/types";
import { AnthropicAIProvider } from "@/lib/ai/providers/anthropic";
import { GoogleAIProvider } from "@/lib/ai/providers/google";

type ProviderName = "anthropic" | "google";

/**
 * Which provider every generation runs on, configured server-side only.
 *
 * Still one model at a time, still a deployment decision rather than a
 * per-request one — the enum, allow-list, column and selector that used to
 * offer this choice to the user are not coming back. What changed is that
 * the deployment can now point at either provider, because a single
 * provider means a single account, and a single account has a limit.
 */
function getProviderName(): ProviderName {
  const raw = (process.env.AI_PROVIDER ?? "anthropic").trim().toLowerCase();
  if (raw !== "anthropic" && raw !== "google") {
    throw new DomainError(
      "CONFIGURATION_ERROR",
      "ai_provider",
      `AI_PROVIDER must be "anthropic" or "google", not "${raw}".`
    );
  }
  return raw;
}

/** The model id for whichever provider is configured. */
export function getModelId(): string {
  const provider = getProviderName();
  const variable = provider === "google" ? "GEMINI_MODEL" : "ANTHROPIC_MODEL";
  const model = process.env[variable];
  if (!model) {
    throw new DomainError(
      "CONFIGURATION_ERROR",
      "ai_provider",
      `Missing required environment variable ${variable} (AI_PROVIDER is "${provider}").`
    );
  }
  return model;
}

export async function getAIProvider(): Promise<AIProvider> {
  return getProviderName() === "google" ? new GoogleAIProvider() : new AnthropicAIProvider();
}
