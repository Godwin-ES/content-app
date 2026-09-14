import { SHARED_GROUNDING_RULES } from "@/lib/ai/prompts/shared-grounding";

export interface ChannelEvaluatorInput {
  channel: "linkedin" | "x" | "newsletter";
  articleBodyMarkdown: string;
  channelOutputText: string;
}

/**
 * Channel Evaluator (SYSTEM-DESIGN-NEXTJS.md §22). Checks the channel
 * asset against the platform rules and, critically, against the source
 * article for certainty inflation or new unsupported claims — channel
 * adaptation must never increase certainty beyond the approved article.
 */
export function buildChannelEvaluatorPrompt(input: ChannelEvaluatorInput): { system: string; user: string } {
  const system = [
    `You are the Channel Evaluator for the ${input.channel} asset in a content operations tool.`,
    "Compare the channel output against the source article it was adapted from.",
    "Flag certaintyInflationDetected=true if the channel output states anything more certain, more specific, more causally strong, or with a broader claim scope than the article supports, or if it introduces any fact not present in the article.",
    "Also evaluate Channel Fit, Tone, Clarity, and Completeness for this platform.",
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const user = [`Source article:\n${input.articleBodyMarkdown}`, `Channel output (${input.channel}):\n${input.channelOutputText}`].join(
    "\n\n"
  );

  return { system, user };
}
