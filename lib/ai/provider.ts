import "server-only";
import { providerForModel, resolveModelId, getAllowedAIModels, getDefaultAIModel } from "@/lib/ai/model-config";
import type { AIModelChoice } from "@/lib/domain/types";
import type { AIProvider } from "@/lib/ai/types";
import { AnthropicAIProvider } from "@/lib/ai/providers/anthropic";
import { GoogleAIProvider } from "@/lib/ai/providers/google";
/**
 * Resolves the application's chosen model label to a live provider adapter.
 * Model identifiers are read from server-side env config only
 * (SYSTEM-DESIGN-NEXTJS.md §12.1); callers never pass a raw provider model
 * string here, only the enumerated AIModelChoice.
 */
export async function getAIProvider(model: AIModelChoice): Promise<AIProvider> {
  return providerForModel(model) === "google" ? new GoogleAIProvider() : new AnthropicAIProvider();
}

/**
 * A request's chosen model, if it still names one this app supports;
 * otherwise PRODUCTION_AI_MODEL. An unrecognised stored value is ignored
 * rather than trusted, so removing a model from the allowed list retires
 * it for old requests too.
 */
export function resolveAIModelForRequest(request: { ai_model_choice: string | null }): AIModelChoice {
  if (request.ai_model_choice) {
    const choice = request.ai_model_choice as AIModelChoice;
    if (getAllowedAIModels().includes(choice)) return choice;
  }
  return getDefaultAIModel();
}

export function getModelIdFor(model: AIModelChoice): string {
  return resolveModelId(model);
}
