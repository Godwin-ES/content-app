import { SHARED_GROUNDING_RULES } from "@/lib/ai/prompts/shared-grounding";
import { CHANNEL_WRITING_CRAFT, CERTAINTY_RULE } from "@/lib/ai/prompts/channel-craft";
import type { ChannelAdapterInput } from "@/lib/ai/prompts/linkedin-adapter";

/**
 * Newsletter Adapter (SYSTEM-DESIGN-NEXTJS.md §21.3). Adapts the
 * already-approved article only; performs no new research.
 */
export function buildNewsletterAdapterPrompt(input: ChannelAdapterInput): { system: string; user: string } {
  const system = [
    "You are the Newsletter Adapter for a content operations tool.",
    "Adapt the supplied article into one email newsletter. Do not research anything new; only use what the article states.",
    "",
    "Subject line: 4 to 9 words in sentence case — first word capitalised, proper nouns capitalised, the rest lower. Not Title Case Like This, and not all lowercase, which reads as careless rather than casual. Promise something specific, and make it sound like a person sent it rather than a report being published. No colon splitting a topic from a subtitle, no \"A Deep Dive Into\".",
    "Introduction: 1 to 3 sentences that say why this matters to this reader now. Not a summary of what follows, and not a restatement of the subject line — give them the stake.",
    "Body: 250 to 600 words — count them, and if you are under 250 you have summarised rather than written. Skimmable but still written. Subheadings must say something — \"Streaming platforms are doing the maths on royalties\" is a subheading; \"Streaming and Financial Strategies\" is a filing label. A reader skimming only your subheadings should come away with the argument.",
    "Use 3 or 4 subheadings — not zero. A newsletter body that is one unbroken run of prose cannot be skimmed, which is how most of it will be read.",
    "Under each subheading, write 3 to 5 sentences of prose. Use a bullet list only where you are genuinely enumerating parallel items, at most once in the whole email, and write each bullet as a real sentence — never \"Category: restatement\".",
    "Call to action: one specific next step, phrased as something worth doing rather than an instruction.",
    "The signoff is the last thing the reader sees and NOTHING is printed after it — no sender name, no team name, no signature block. So write a complete closing line that stands on its own and ends in a full stop, not a letter-style valediction left hanging on a comma: \"Here's to smarter hiring.\" works; \"To your talent success,\" and \"Best regards,\" do not, because they read as though a name should follow. Keep it warm but sharp — the tone of a colleague who respects the reader's time, not a greetings card.",
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
    input.cta ? `Call to action: ${input.cta}` : "No specific call to action was supplied; propose one consistent with the article.",
    `Article title: ${input.articleTitle}`,
    `Article body:\n${input.articleBodyMarkdown}`,
    input.instruction ? `Instruction from the Content Manager for this regeneration:\n${input.instruction}` : null,
  ].filter((line): line is string => line !== null);

  return { system, user: user.join("\n\n") };
}
