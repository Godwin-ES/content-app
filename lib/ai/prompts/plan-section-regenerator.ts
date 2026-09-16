import { SHARED_GROUNDING_RULES, formatEvidencePackets, type EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";
import type { ContentPlanSection } from "@/lib/ai/schemas/content-plan";

export interface PlanSectionRegeneratorInput {
  topic: string;
  audience: string;
  objective: string;
  tone: string;
  planTitle: string;
  planAngle: string;
  /** Every other section, for context/continuity — the target section itself is passed separately. */
  otherSections: ContentPlanSection[];
  targetSection: ContentPlanSection;
  instruction: string | null;
  evidencePackets: EvidencePacketInput[];
}

/**
 * Regenerates exactly one plan section in place (Phase 3 of the
 * post-Task-22 UX pass) — the rest of the plan is shown only for
 * continuity, never modified. Subject to the same evidence-grounding
 * discipline as the full Content Planner: a factual section still needs
 * real evidence IDs, or it must be marked editorial instead.
 */
export function buildPlanSectionRegeneratePrompt(input: PlanSectionRegeneratorInput): { system: string; user: string } {
  const system = [
    "You are the Content Planner for a content operations tool, regenerating exactly one section of an existing outline.",
    "Return only the replacement for the target section — its heading, level, purpose, whether it has factual claims, and (if so) the evidence IDs it may draw on.",
    "Mark hasFactualClaims=true only if the section will state something externally verifiable, and list only real evidence IDs (e.g. S4:E1) from the supplied reviewed evidence.",
    "Keep the section consistent with the rest of the outline's title, angle, and the other sections listed below — do not duplicate what another section already covers.",
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const user = [
    `Topic: ${input.topic}`,
    `Audience: ${input.audience}`,
    `Objective: ${input.objective}`,
    `Tone: ${input.tone}`,
    `Plan title: ${input.planTitle}`,
    `Plan angle: ${input.planAngle}`,
    `Other sections already in this plan (for context, do not duplicate):\n${input.otherSections.map((s) => `- [${s.level}] ${s.heading}`).join("\n") || "(none)"}`,
    `Section to regenerate — current version:\n[${input.targetSection.level}] ${input.targetSection.heading}\nPurpose: ${input.targetSection.purpose}`,
    input.instruction ? `Instruction from the Content Manager for this regeneration:\n${input.instruction}` : "No specific instruction was given — improve or refresh this section while keeping its role in the outline.",
    "Reviewed evidence:",
    formatEvidencePackets(input.evidencePackets),
  ].join("\n\n");

  return { system, user };
}
