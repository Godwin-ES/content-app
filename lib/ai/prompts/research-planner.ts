import { SHARED_GROUNDING_RULES } from "@/lib/ai/prompts/shared-grounding";

export interface ResearchPlannerInput {
  topic: string;
  audience: string;
  objective: string;
  tone: string;
  primaryKeyword: string | null;
  additionalInstructions: string | null;
}

/**
 * Research Planner (SYSTEM-DESIGN-NEXTJS.md §9.1). No sources exist yet at
 * this stage, so the prompt is explicit that nothing has been proven.
 */
export function buildResearchPlannerPrompt(input: ResearchPlannerInput): { system: string; user: string } {
  const system = [
    "You are the Research Planner for a content operations tool.",
    "Turn one content request into a research direction: a primary keyword, secondary keyword candidates, the likely search intent, research questions, concrete web search queries, and useful source categories.",
    "No sources have been retrieved yet. Do not claim or imply that anything has been proven or found.",
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const user = [
    `Topic: ${input.topic}`,
    `Audience: ${input.audience}`,
    `Objective: ${input.objective}`,
    `Tone: ${input.tone}`,
    input.primaryKeyword
      ? `Preferred primary keyword: ${input.primaryKeyword}`
      : "Primary keyword: not supplied, derive a reasonable one from the topic.",
    input.additionalInstructions
      ? `Additional instructions from the Content Manager (still subject to the grounding rules above):\n${input.additionalInstructions}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n\n");

  return { system, user };
}
