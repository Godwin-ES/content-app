import { SHARED_GROUNDING_RULES, formatEvidencePackets, type EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";
import type { ContentPlan } from "@/lib/ai/schemas/content-plan";

export type ArticleAngle = "practical" | "strategic" | "educational";

const ANGLE_GUIDANCE: Record<ArticleAngle, string> = {
  practical: "Write a practical, operational angle: concrete steps, tactics, and what to actually do.",
  strategic: "Write a strategic, thought-leadership angle: why this matters, bigger-picture implications, and what leaders should consider.",
  educational: "Write an educational, explanatory angle: clearly explain the concept, how it works, and what a newcomer needs to understand.",
};

export interface ArticleWriterInput {
  angle: ArticleAngle;
  audience: string;
  objective: string;
  tone: string;
  cta: string | null;
  plan: ContentPlan;
  evidencePackets: EvidencePacketInput[];
}

const STRUCTURE_RULES = [
  "Use exactly one H1 (the title). Include the primary keyword in the title and within the first 100 words.",
  "Use H2 section headers, and H3 subheaders where needed.",
  "Use short paragraphs of 2 to 3 sentences.",
  "Include 2 to 3 relevant internal or external links.",
  "Every factual or inference claim must appear in the `claims` array with the exact evidence IDs (e.g. S4:E1) it draws on. Editorial/connective language does not need a claim entry.",
].join("\n- ");

/**
 * Article Writer (SYSTEM-DESIGN-NEXTJS.md §15). Same request, evidence, and
 * content plan produce three angle-differentiated options; the writer
 * always returns a claim ledger alongside the public prose.
 */
export function buildArticleWriterPrompt(input: ArticleWriterInput): { system: string; user: string } {
  const system = [
    "You are the Article Writer for a content operations tool.",
    ANGLE_GUIDANCE[input.angle],
    "Follow the supplied content plan's sections and evidence coverage. Do not add factual sections beyond what the plan and evidence support.",
    "If you cannot respons­ibly complete a factual section from the supplied evidence, write it more cautiously or omit the unsupported specifics rather than inventing them; if the evidence is fundamentally insufficient for this angle, set insufficientEvidence=true and explain why.",
    "Structure and SEO requirements:",
    `- ${STRUCTURE_RULES}`,
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const userParts = [
    `Audience: ${input.audience}`,
    `Objective: ${input.objective}`,
    `Tone: ${input.tone}`,
    input.cta ? `Call to action: ${input.cta}` : null,
    `Content plan title: ${input.plan.title}`,
    `Angle: ${input.plan.angle}`,
    `Primary keyword: ${input.plan.primaryKeyword}`,
    `Secondary keywords: ${input.plan.secondaryKeywords.join(", ") || "none"}`,
    "Planned sections:",
    input.plan.sections
      .map((s) => `- [${s.level}] ${s.heading} (${s.purpose})${s.hasFactualClaims ? ` — evidence: ${s.evidenceIds.join(", ")}` : ""}`)
      .join("\n"),
    input.plan.knownLimitations ? `Known limitations from planning: ${input.plan.knownLimitations}` : null,
    "Reviewed evidence:",
    formatEvidencePackets(input.evidencePackets),
  ];

  return { system, user: userParts.filter((line): line is string => line !== null).join("\n\n") };
}
