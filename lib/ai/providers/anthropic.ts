import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DomainError, getErrorMessage } from "@/lib/domain/errors";
import type { AIProvider, GenerateStructuredInput } from "@/lib/ai/types";

const RESULT_TOOL_NAME = "emit_result";
/**
 * 8192 was the old shared ceiling, and a full long-form article plus its
 * structured wrapper does not fit inside it — every article generation
 * failed at exactly that boundary. Sonnet 5 allows far more, so the cap is
 * now high enough that hitting it means the prompt is genuinely wrong
 * rather than the article merely being long.
 */
const MAX_OUTPUT_TOKENS = 32000;

/**
 * Converts the response schema into a plain JSON Schema tool definition and
 * forces the model to call it (SYSTEM-DESIGN-NEXTJS.md §12.1, §13.4): tool
 * use is Anthropic's structured-output mechanism, chosen because it works
 * consistently across both Sonnet and Haiku.
 */
function toToolInputSchema(schema: z.ZodType): Anthropic.Tool["input_schema"] {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema as Anthropic.Tool["input_schema"];
}

export class AnthropicAIProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new DomainError("CONFIGURATION_ERROR", "ai_provider", "Missing ANTHROPIC_API_KEY.");
    }
    this.client = new Anthropic({ apiKey: key });
  }

  async generateStructured<T>({ modelId, system, user, schema }: GenerateStructuredInput<T>): Promise<T> {
    const attempt = async (): Promise<T> => {
      let response: Anthropic.Message;
      try {
        // Streamed rather than a plain create(): at a 32k output budget the
        // SDK refuses a non-streaming request outright, because a response
        // that size can outlast the 10-minute non-streaming limit. Nothing
        // here consumes the stream incrementally — a Server Action returns
        // once, whole — so the final message is all that is wanted, and
        // streaming is simply what makes a long generation legal.
        response = await this.client.messages
          .stream({
            model: modelId,
            max_tokens: MAX_OUTPUT_TOKENS,
            system,
            messages: [{ role: "user", content: user }],
            tools: [
              {
                name: RESULT_TOOL_NAME,
                description: "Return the required structured result. Always call this tool exactly once.",
                input_schema: toToolInputSchema(schema),
              },
            ],
            tool_choice: { type: "tool", name: RESULT_TOOL_NAME },
          })
          .finalMessage();
      } catch (error) {
        // Normalize any thrown value to a readable message, mirroring the
        // fix applied to the Google adapter after manual verification
        // surfaced "[object Object]" errors (see ../../../../BUILD-NOTES-NEXTJS.md).
        throw new DomainError("VALIDATION_ERROR", "ai_provider", `Claude request failed: ${getErrorMessage(error)}`);
      }

      // A response cut off at the ceiling arrives as a truncated tool input,
      // which then fails schema validation — and VALIDATION_ERROR is exactly
      // what triggers the retry below, so the identical oversized request
      // gets made a second time and fails identically. Naming the real cause
      // here both explains the failure and keeps it out of the retry path.
      if (response.stop_reason === "max_tokens") {
        throw new DomainError(
          "OUTPUT_TRUNCATED",
          "ai_provider",
          `The model stopped at its ${MAX_OUTPUT_TOKENS}-token output limit before finishing. ` +
            "Retrying would produce the same result — the request needs to ask for less."
        );
      }

      const toolUse = response.content.find((block) => block.type === "tool_use");
      if (!toolUse) {
        throw new DomainError("VALIDATION_ERROR", "ai_provider", "Model response did not include a structured result.");
      }

      const parsed = schema.safeParse(toolUse.input);
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
