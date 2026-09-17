import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { DomainError, getErrorMessage } from "@/lib/domain/errors";
import type { AIProvider, GenerateStructuredInput } from "@/lib/ai/types";

/**
 * Set explicitly rather than inherited. Left unset, Gemini applies whatever
 * its own per-model default happens to be — a number we neither chose nor
 * can see, which can change under us between model versions. Matched to the
 * Anthropic adapter so a request that fits one provider fits the other.
 */
const MAX_OUTPUT_TOKENS = 8192;

function toJsonSchema(schema: z.ZodType): unknown {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

export class GoogleAIProvider implements AIProvider {
  private client: GoogleGenAI;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.GOOGLE_AI_API_KEY;
    if (!key) {
      throw new DomainError("CONFIGURATION_ERROR", "ai_provider", "Missing GOOGLE_AI_API_KEY.");
    }
    this.client = new GoogleGenAI({ apiKey: key });
  }

  async generateStructured<T>({ modelId, system, user, schema }: GenerateStructuredInput<T>): Promise<T> {
    const attempt = async (): Promise<T> => {
      let response: Awaited<ReturnType<typeof this.client.models.generateContent>>;
      try {
        response = await this.client.models.generateContent({
          model: modelId,
          contents: user,
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseJsonSchema: toJsonSchema(schema),
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        });
      } catch (error) {
        // The Google GenAI client can throw plain objects rather than Error
        // instances; normalize so callers always get a readable message
        // instead of "[object Object]" (found via manual research-pipeline
        // verification, see ../../../../BUILD-NOTES-NEXTJS.md).
        throw new DomainError("VALIDATION_ERROR", "ai_provider", `Gemini request failed: ${getErrorMessage(error)}`);
      }

      // Constrained decoding keeps the JSON well-formed even when the limit
      // is reached, so a truncated response can parse cleanly and still be
      // missing most of its content — the failure is silent unless the
      // finish reason is checked.
      if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        throw new DomainError(
          "OUTPUT_TRUNCATED",
          "ai_provider",
          `The model stopped at its ${MAX_OUTPUT_TOKENS}-token output limit before finishing. ` +
            "Retrying would produce the same result — the request needs to ask for less."
        );
      }

      const text = response.text;
      if (!text) {
        throw new DomainError("VALIDATION_ERROR", "ai_provider", "Model response did not include any text output.");
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new DomainError("VALIDATION_ERROR", "ai_provider", "Model output was not valid JSON.");
      }

      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new DomainError(
          "VALIDATION_ERROR",
          "ai_provider",
          `Model output did not match the required schema: ${parsed.error.message}`
        );
      }
      return parsed.data;
    };

    try {
      return await attempt();
    } catch (error) {
      // One controlled retry only for structurally invalid output
      // (SYSTEM-DESIGN-NEXTJS.md §26.4); anything else surfaces immediately.
      if (error instanceof DomainError && error.code === "VALIDATION_ERROR") {
        return await attempt();
      }
      throw error;
    }
  }
}
