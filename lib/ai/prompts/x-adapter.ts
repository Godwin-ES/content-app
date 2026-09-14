import { SHARED_GROUNDING_RULES } from "@/lib/ai/prompts/shared-grounding";
import type { ChannelAdapterInput } from "@/lib/ai/prompts/linkedin-adapter";

const CERTAINTY_RULE =
  "Do not increase certainty, specificity, numerical precision, causal strength, or claim scope beyond what the article states. Compressing language is fine; strengthening a claim is not.";

/**
 * X Adapter (SYSTEM-DESIGN-NEXTJS.md §21.2). Adapts the already-approved
 * article only; performs no new research.
 */
export function buildXAdapterPrompt(input: ChannelAdapterInput): { system: string; user: string } {
  const system = [
    "You are the X (Twitter) Adapter for a content operations tool.",
    "Adapt the supplied article into one X post. Do not research anything new; only use what the article states.",
    "Lead with the single strongest insight, benefit, or hook. Keep the post focused on one core idea. Use line breaks for readability. Use no more than 1 to 2 relevant hashtags, and only if they add value.",
    CERTAINTY_RULE,
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const user = [
    `Audience: ${input.audience}`,
    `Tone: ${input.tone}`,
    `Article title: ${input.articleTitle}`,
    `Article body:\n${input.articleBodyMarkdown}`,
  ].join("\n\n");

  return { system, user };
}
