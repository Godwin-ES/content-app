import { SHARED_GROUNDING_RULES } from "@/lib/ai/prompts/shared-grounding";
import type { ChannelAdapterInput } from "@/lib/ai/prompts/linkedin-adapter";

const CERTAINTY_RULE =
  "Do not increase certainty, specificity, numerical precision, causal strength, or claim scope beyond what the article states. Compressing language is fine; strengthening a claim is not.";

/**
 * Newsletter Adapter (SYSTEM-DESIGN-NEXTJS.md §21.3). Adapts the
 * already-approved article only; performs no new research.
 */
export function buildNewsletterAdapterPrompt(input: ChannelAdapterInput): { system: string; user: string } {
  const system = [
    "You are the Newsletter Adapter for a content operations tool.",
    "Adapt the supplied article into one email newsletter. Do not research anything new; only use what the article states.",
    "Use a strong subject line with a clear benefit or point of intrigue. Start with a 1 to 3 sentence introduction. Make the main value section skimmable with subheadings or bullets. Include a clear call to action and a friendly signoff. Write like you are speaking to a smart, busy reader. Target 250 to 600 words total.",
    CERTAINTY_RULE,
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const user = [
    `Audience: ${input.audience}`,
    `Tone: ${input.tone}`,
    input.cta ? `Call to action: ${input.cta}` : "No specific call to action was supplied; propose one consistent with the article.",
    `Article title: ${input.articleTitle}`,
    `Article body:\n${input.articleBodyMarkdown}`,
  ].join("\n\n");

  return { system, user };
}
