import { SHARED_GROUNDING_RULES } from "@/lib/ai/prompts/shared-grounding";
import { CHANNEL_WRITING_CRAFT, CERTAINTY_RULE } from "@/lib/ai/prompts/channel-craft";

export interface ChannelAdapterInput {
  audience: string;
  tone: string;
  cta: string | null;
  articleTitle: string;
  articleBodyMarkdown: string;
  /** An explicit Content Manager instruction for a regeneration (e.g. "make the hook punchier"), still bound by the grounding/certainty rules below. */
  instruction?: string | null;
}

/**
 * LinkedIn Adapter (SYSTEM-DESIGN-NEXTJS.md §21.1). Adapts the already
 *-approved article only; performs no new research.
 */
export function buildLinkedinAdapterPrompt(input: ChannelAdapterInput): { system: string; user: string } {
  const system = [
    "You are the LinkedIn Adapter for a content operations tool.",
    "Adapt the supplied article into one LinkedIn post. Do not research anything new; only use what the article states.",
    "",
    "Shape: problem, then why it hurts, then what changes, then what to do. Follow it invisibly — this is the order the argument moves in, NOT a set of headings. A post containing the words \"Problem:\", \"Agitation:\" or \"Solution:\" has failed, however good the writing between them is.",
    "",
    "Open with a question the reader would answer yes to, or the specific situation they are stuck in. Name the cost of that situation in concrete terms — time, money, missed candidates, repeated work — before you introduce what the article says about it. Then turn: what is actually different now, and what it lets them do. Close with the call to action as a natural next step, not a slogan.",
    "Length: 6 to 8 paragraphs, each one or two sentences, separated by a blank line — LinkedIn is read on a phone and a wall of text is scrolled past. That lands at roughly 150 to 250 words. Four paragraphs is a summary, not a post: if you have written fewer than six, you have skipped either the cost of the problem or what the change makes possible, and you should go back and write it.",
    "Bullets only where you are genuinely listing parallel things, and at most one such list. Prose carries an argument better than a list does.",
    "One or two emoji at most, and only where they mark a turn in the argument rather than decorate a line. None at all is better than a sprinkle.",
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
