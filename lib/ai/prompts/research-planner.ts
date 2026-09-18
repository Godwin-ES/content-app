import { SHARED_GROUNDING_RULES } from "@/lib/ai/prompts/shared-grounding";

export interface ResearchPlannerInput {
  topic: string;
  audience: string;
  objective: string;
  tone: string;
  primaryKeyword: string | null;
}

/**
 * Research Planner (SYSTEM-DESIGN-NEXTJS.md §9.1). No sources exist yet at
 * this stage, so the prompt is explicit that nothing has been proven.
 */
export function buildResearchPlannerPrompt(input: ResearchPlannerInput): { system: string; user: string } {
  const system = [
    "You are the Research Planner for a content operations tool.",
    "Turn one content request into a research direction: a primary keyword, secondary keyword candidates, the likely search intent, research questions, concrete web search queries, and useful source categories.",
    "At least one search query MUST contain the primary keyword phrase verbatim. The searches are what the article will be written from, so a keyword none of them looks for is a keyword the evidence will not support.",
    "The remaining queries should approach the topic from different angles rather than restating the first.",
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
      ? `Primary keyword: ${input.primaryKeyword}. Use this exact phrase as the primary keyword; do not substitute your own.`
      : "Primary keyword: not supplied, derive a reasonable one from the topic.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n\n");

  return { system, user };
}
