import { SHARED_GROUNDING_RULES, formatEvidencePackets, type EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";
import type { ArticleOutput } from "@/lib/ai/schemas/article";

export interface ArticleEvaluatorInput {
  audience: string;
  objective: string;
  tone: string;
  article: ArticleOutput;
  evidencePackets: EvidencePacketInput[];
}

const RUBRIC_CRITERIA = [
  "topic_relevance — the content answers the request and stays focused on the intended topic.",
  "source_grounding — claims, examples, and recommendations connect back to reviewed source material.",
  "factual_consistency — the content avoids contradictions, unsupported claims, and invented details.",
  "audience_fit — the content speaks to the target audience at the right level of depth.",
  "tone — the style matches the brand and channel.",
  "seo_fit — the article uses the primary keyword, relevant secondary keywords, clear headings, and useful links.",
  "clarity — the content is easy to read, skimmable, and direct.",
  "completeness — the output includes every required section.",
].join("\n- ");

/**
 * Article Evaluator (SYSTEM-DESIGN-NEXTJS.md §17). A separate call from the
 * writer, and it never receives the writer's internal justification —
 * only the public article, its claim ledger, and the same approved
 * evidence. Source Grounding and Factual Consistency are critical:
 * strong style cannot compensate for a grounding failure (checked by
 * semantic validation in Task 13, not by this prompt alone).
 */
export function buildArticleEvaluatorPrompt(input: ArticleEvaluatorInput): { system: string; user: string } {
  const system = [
    "You are the Article Evaluator for a content operations tool, using the supplied rubric.",
    "Score each rubric criterion 1-5 with a concise finding. Source Grounding and Factual Consistency are critical: a significant unresolved unsupported claim must prevent an overall `pass`, regardless of how strong the writing style is elsewhere.",
    "Audit every claim in the supplied claim ledger against the supplied evidence: mark it supported, unsupported (no matching evidence), or overreaching (evidence exists but the claim states more than the evidence establishes).",
    "Rubric criteria:",
    `- ${RUBRIC_CRITERIA}`,
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const userParts = [
    `Audience: ${input.audience}`,
    `Objective: ${input.objective}`,
    `Tone: ${input.tone}`,
    `Article title: ${input.article.title}`,
    `Article body:\n${input.article.bodyMarkdown}`,
    `Claim ledger:\n${JSON.stringify(input.article.claims, null, 2)}`,
    "Reviewed evidence:",
    formatEvidencePackets(input.evidencePackets),
  ];

  return { system, user: userParts.join("\n\n") };
}
