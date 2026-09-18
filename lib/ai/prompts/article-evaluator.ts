import { SHARED_GROUNDING_RULES, formatEvidencePackets, type EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";
import { articleBodyMarkdown, type ArticleOutput } from "@/lib/ai/schemas/article";

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
 * The evidence the evaluator actually needs: what the article's claims
 * cite, and nothing else.
 *
 * It used to be handed the entire reviewed evidence set. Most of that is
 * evidence no claim draws on — the evaluator's job is to check the claims
 * that were made, not to discover the ones that could have been — and a
 * prompt several times larger than the question is what made this the
 * second-slowest step in the pipeline. Whether a cited ID exists at all is
 * already settled deterministically by validateClaimEvidence before this
 * call is made, so nothing is lost by only sending what was cited.
 */
function citedEvidence(input: ArticleEvaluatorInput): EvidencePacketInput[] {
  const cited = new Set(input.article.claims.flatMap((claim) => claim.evidenceIds));
  if (cited.size === 0) return [];
  return input.evidencePackets.filter((packet) => cited.has(`${packet.sourceLabel}:${packet.evidenceKey}`));
}

/**
 * Article Evaluator (SYSTEM-DESIGN-NEXTJS.md §17). A separate call from the
 * writer, and it never receives the writer's internal justification —
 * only the public article, its claim ledger, and the evidence that ledger
 * cites. Source Grounding and Factual Consistency are critical:
 * strong style cannot compensate for a grounding failure (checked by
 * semantic validation in Task 13, not by this prompt alone).
 */
export function buildArticleEvaluatorPrompt(input: ArticleEvaluatorInput): { system: string; user: string } {
  const system = [
    "You are the Article Evaluator for a content operations tool, using the supplied rubric.",
    "Score each rubric criterion 1-5 with a concise finding. Source Grounding and Factual Consistency are critical: a significant unresolved unsupported claim must prevent an overall `pass`, regardless of how strong the writing style is elsewhere.",
    "Audit every claim in the supplied claim ledger against the evidence it cites, and judge whether the evidence bears the weight the claim puts on it: mark it supported, or overreaching (the cited evidence exists but the claim states more than it establishes).",
    "Every cited evidence ID has already been verified to exist by a separate deterministic check, so do not spend effort re-checking that an ID is valid — judge what the evidence says against what the claim says.",
    "Be concise. Findings are one sentence each.",
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
    `Article body:\n${articleBodyMarkdown(input.article)}`,
    `Claim ledger:\n${JSON.stringify(input.article.claims, null, 2)}`,
    "Evidence cited by those claims:",
    formatEvidencePackets(citedEvidence(input)),
  ];

  return { system, user: userParts.join("\n\n") };
}
