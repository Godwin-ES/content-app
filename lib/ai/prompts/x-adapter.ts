import { SHARED_GROUNDING_RULES } from "@/lib/ai/prompts/shared-grounding";
import { CHANNEL_WRITING_CRAFT, CERTAINTY_RULE } from "@/lib/ai/prompts/channel-craft";
import type { ChannelAdapterInput } from "@/lib/ai/prompts/linkedin-adapter";

/**
 * X Adapter (SYSTEM-DESIGN-NEXTJS.md §21.2). Adapts the already-approved
 * article only; performs no new research.
 */
export function buildXAdapterPrompt(input: ChannelAdapterInput): { system: string; user: string } {
  const system = [
    "You are the X (Twitter) Adapter for a content operations tool.",
    "Adapt the supplied article into one X post. Do not research anything new; only use what the article states.",
    "",
    "ONE idea. Not a summary of the article, not three themes joined by commas — the single sharpest thing in it. Everything else in the article is someone else's post.",
    "The first line decides whether the rest is read. Make it a concrete fact, a number worth stopping for, or a claim someone could disagree with. Never a definition, never \"X is transforming Y\", never a sentence that could open any article on the subject.",
    "Then one or two short lines that make that first line land: what it means, or what follows from it. Stop there. A post that has said its one thing and stopped is stronger than one that keeps going.",
    "Line breaks between thoughts — a blank line, not a paragraph. Three or four short lines beats one dense block.",
    "Length: 180 to 270 characters of body is the target. Under 280 total is a hard limit.",
    "Hashtags go in the `hashtags` field, never in the body, at most two, and only ones a person would actually search. Camel-case multi-word tags. Zero is a perfectly good answer; two generic ones are worse than none.",
    "",
    CHANNEL_WRITING_CRAFT,
    "",
    CERTAINTY_RULE,
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const user = [
    `Audience: ${input.audience}`,
    `Tone: ${input.tone}`,
    `Article title: ${input.articleTitle}`,
    `Article body:\n${input.articleBodyMarkdown}`,
    input.instruction ? `Instruction from the Content Manager for this regeneration:\n${input.instruction}` : null,
  ].filter((line): line is string => line !== null);

  return { system, user: user.join("\n\n") };
}
