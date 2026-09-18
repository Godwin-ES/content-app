import { SHARED_GROUNDING_RULES, wrapUntrustedContent } from "@/lib/ai/prompts/shared-grounding";

export interface SourceAnalyzerInput {
  topic: string;
  researchQuestions: string[];
  sourceLabel: string;
  rawText: string;
}

const MAX_SOURCE_TEXT_CHARS = 12000;

/**
 * Source Analyzer (SYSTEM-DESIGN-NEXTJS.md §9.4, §11). Extracts only
 * evidence clearly present in the retrieved page; classifies boilerplate
 * or unusable pages as such instead of inventing relevance.
 */
export function buildSourceAnalyzerPrompt(input: SourceAnalyzerInput): { system: string; user: string } {
  const system = [
    "You are the Source Analyzer for a content operations tool.",
    "Read one retrieved web page and extract evidence items that are clearly present in its text.",
    "If the page is mostly navigation, cookie notices, a login wall, or other boilerplate with no substantive content relevant to the topic, set isUsable to false and return no evidence items.",
    "Each evidence item must include a conservative summary plus what it supports and what it does not establish. Do not infer beyond the literal text.",
    "",
    "Then recommend whether to keep this source for this topic.",
    "Recommend `exclude` when the page is about a different subject, is too thin to support anything, is purely promotional with no substance, or answers none of the research questions. Recommend `accept` when it genuinely bears on the topic, even partially.",
    "Judge relevance to the topic, not quality of writing or agreement with any position: a source that contradicts the expected answer is relevant evidence, not a reason to exclude.",
    "`recommendationReason` is one short sentence a person can act on, naming what the page is actually about when you exclude it.",
    "Every evidence item's evidenceKey must be a short, descriptive, human-readable slug (lowercase_with_underscores, 2-4 words) that summarizes what that specific piece of evidence is about — e.g. \"benefits_time_to_hire\" or \"example_company_x_rollout\". Never use a generic sequential label like \"E1\", \"E2\", \"item_3\", or a bare number — a reader who has never seen the source must be able to guess roughly what the evidence says just from its key.",
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const user = [
    `Topic being researched: ${input.topic}`,
    `Research questions:\n${input.researchQuestions.map((q) => `- ${q}`).join("\n")}`,
    wrapUntrustedContent(input.sourceLabel, input.rawText.slice(0, MAX_SOURCE_TEXT_CHARS)),
  ].join("\n\n");

  return { system, user };
}
