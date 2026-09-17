import { SHARED_GROUNDING_RULES, formatEvidencePackets, type EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";
import { articleBodyMarkdown, type ArticleOutput } from "@/lib/ai/schemas/article";
import type { Evaluation } from "@/lib/ai/schemas/evaluation";

export interface ArticleReviserInput {
  article: ArticleOutput;
  evaluation: Evaluation;
  evidencePackets: EvidencePacketInput[];
}

/**
 * Article Reviser (SYSTEM-DESIGN-NEXTJS.md §18). Code enforces the
 * one-automatic-revision limit before this is ever called; the prompt's
 * job is to fix exactly what the evaluator flagged, preserve everything
 * else, and never introduce a new fact the evidence does not support.
 */
export function buildArticleReviserPrompt(input: ArticleReviserInput): { system: string; user: string } {
  const system = [
    "You are the Article Reviser for a content operations tool.",
    "You are given one article, the evaluation that flagged it for revision, and the same approved evidence the writer used.",
    "Fix exactly the issues the evaluation identifies: unsupported or overreaching claims, sections needing revision, and the stated revision instructions.",
    "Preserve every part of the article the evaluation did not flag. Do not regenerate from scratch, and do not introduce any new fact, statistic, example, or claim that is not already supported by the supplied evidence.",
    "Return the complete revised article in the same structured format, with an updated claim ledger.",
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const userParts = [
    `Current article title: ${input.article.title}`,
    `Current article body:\n${articleBodyMarkdown(input.article)}`,
    `Current claim ledger:\n${JSON.stringify(input.article.claims, null, 2)}`,
    `Evaluation status: ${input.evaluation.overallStatus}`,
    `Unsupported claims to fix: ${input.evaluation.unsupportedClaims.join("; ") || "none listed"}`,
    `Sections needing revision: ${input.evaluation.sectionsNeedingRevision.join("; ") || "none listed"}`,
    input.evaluation.revisionInstructions ? `Specific revision instructions: ${input.evaluation.revisionInstructions}` : null,
    "Reviewed evidence (same set the writer used):",
    formatEvidencePackets(input.evidencePackets),
  ];

  return { system, user: userParts.filter((line): line is string => line !== null).join("\n\n") };
}
