import { SHARED_GROUNDING_RULES } from "@/lib/ai/prompts/shared-grounding";

export interface ChannelEvaluatorInput {
  channel: "linkedin" | "x" | "newsletter";
  articleBodyMarkdown: string;
  channelOutputText: string;
}

const PLATFORM_RULES: Record<ChannelEvaluatorInput["channel"], string> = {
  linkedin:
    "Uses the PAS structure (Problem, Agitation, Solution); short paragraphs; bullets/simple symbols where they help; only a small number of relevant emoji if they fit the brand tone; ends with a clear call to action.",
  x: "Leads with the single strongest insight/benefit/hook; stays focused on one core idea; uses line breaks for readability; no more than 1-2 relevant hashtags.",
  newsletter:
    "Strong subject line with a clear benefit or point of intrigue; a 1-3 sentence introduction; a skimmable main section (subheadings/bullets); a clear call to action; a warm sign-off that is a complete closing line ending in a full stop, since nothing is printed after it; 250-600 words total.",
};

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
    `Evaluate this platform's specific formatting requirements: ${PLATFORM_RULES[input.channel]}`,
    "Also evaluate Tone, Clarity, and Completeness for this platform.",
    "`findings` must never be empty: write at least one specific, concrete observation that explicitly names which of this platform's formatting requirements it relates to (e.g. \"Uses the PAS structure correctly — opens with the problem, agitates it, then resolves it\" or \"Missing a clear call to action, required by this platform's rules\"), not a generic restatement of the channelFit score.",
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const user = [`Source article:\n${input.articleBodyMarkdown}`, `Channel output (${input.channel}):\n${input.channelOutputText}`].join(
    "\n\n"
  );

  return { system, user };
}
