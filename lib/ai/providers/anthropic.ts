import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DomainError } from "@/lib/domain/errors";
import type { AIProvider, GenerateStructuredInput } from "@/lib/ai/types";

const RESULT_TOOL_NAME = "emit_result";
const MAX_OUTPUT_TOKENS = 8192;

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
      const response = await this.client.messages.create({
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
      });

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
