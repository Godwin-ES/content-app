import { SHARED_GROUNDING_RULES, formatEvidencePackets, type EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";

export interface ContentPlannerInput {
  topic: string;
  audience: string;
  objective: string;
  tone: string;
  cta: string | null;
  primaryKeyword: string | null;
  evidencePackets: EvidencePacketInput[];
  resolvedConflicts: string[];
  /** An explicit Content Manager instruction for this regeneration (e.g. "focus more on cost savings"), still bound by the grounding rules below. */
  additionalInstruction?: string | null;
}

const SEO_RULES = [
  "The title must contain the primary keyword WORD FOR WORD as an unbroken phrase — not rephrased, and with no words inserted into the middle of it. Leading with the exact phrase followed by a colon and a subtitle is the easiest way to do this naturally.",
  "Choose a primary keyword that can actually sit in a title unbroken: a short noun phrase a reader would search for, not a sentence.",
  "Use exactly one H1 (the title); use H2 section headers and H3 subheaders where needed.",
  "Use relevant secondary keywords in section headers and body where natural.",
  "Plan 2 to 3 relevant internal or external links.",
  "Let the depth of each section reflect the strength of the available evidence.",
].join("\n- ");

/**
 * Content Planner (SYSTEM-DESIGN-NEXTJS.md §14). A factual section without
 * evidence coverage should be rejected or written more cautiously; the
 * planner marks each section's evidence coverage explicitly so the
 * deterministic validator (Task 11) can enforce that before article
 * generation.
 */
export function buildContentPlannerPrompt(input: ContentPlannerInput): { system: string; user: string } {
  const system = [
    "You are the Content Planner for a content operations tool.",
    "Produce one SEO-aware article outline using ONLY the supplied reviewed evidence for any section that will contain factual claims.",
    "Mark hasFactualClaims=true on a section only if it will state something externally verifiable, and list the exact evidence IDs (e.g. S4:E1) that section may draw on.",
    "If the supplied evidence is too thin to plan the topic responsibly, set insufficientEvidence=true, explain why, and still return your best-effort outline scoped to what the evidence actually supports.",
    "SEO requirements:",
    `- ${SEO_RULES}`,
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const userParts = [
    `Topic: ${input.topic}`,
    `Audience: ${input.audience}`,
    `Objective: ${input.objective}`,
    `Tone: ${input.tone}`,
    input.cta ? `Call to action direction: ${input.cta}` : null,
    input.primaryKeyword ? `Primary keyword: ${input.primaryKeyword}` : null,
    input.resolvedConflicts.length > 0
      ? `Human decisions about conflicting sources (follow these exactly):\n${input.resolvedConflicts.map((c) => `- ${c}`).join("\n")}`
      : null,
    input.additionalInstruction
      ? `Additional instruction from the Content Manager for this regeneration (still subject to the grounding rules above):\n${input.additionalInstruction}`
      : null,
    "Reviewed evidence:",
    formatEvidencePackets(input.evidencePackets),
  ];

  return { system, user: userParts.filter((line): line is string => line !== null).join("\n\n") };
}
