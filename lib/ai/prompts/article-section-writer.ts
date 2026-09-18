import { SHARED_GROUNDING_RULES, formatEvidencePackets, type EvidencePacketInput } from "@/lib/ai/prompts/shared-grounding";
import type { ContentPlan, ContentPlanSection } from "@/lib/ai/schemas/content-plan";
import type { ArticleAngle } from "@/lib/ai/prompts/article-writer";

const ANGLE_GUIDANCE: Record<ArticleAngle, string> = {
  practical: "Write a practical, operational angle: concrete steps, tactics, and what to actually do.",
  strategic: "Write a strategic, thought-leadership angle: why this matters, bigger-picture implications, and what leaders should consider.",
  educational: "Write an educational, explanatory angle: clearly explain the concept, how it works, and what a newcomer needs to understand.",
};

export interface ArticleSectionWriterInput {
  angle: ArticleAngle;
  audience: string;
  objective: string;
  tone: string;
  cta: string | null;
  plan: ContentPlan;
  /** The one section being written. */
  section: ContentPlanSection;
  /** Its position in the plan, so it can be told what it opens or closes. */
  sectionIndex: number;
  /** The article title, so every section writes under the same banner. */
  title: string;
  /** Only the evidence this section's plan entry cites. */
  evidencePackets: EvidencePacketInput[];
}

/**
 * Article Section Writer: one planned section, written on its own so the
 * article's sections can be written concurrently.
 *
 * Writing sections in parallel is what makes an article fast, and it is
 * also the obvious way to produce something disjointed — five calls that
 * cannot see each other will each introduce the topic, each summarise it
 * at the end, and each reach for the same example. The defence is context,
 * not luck: every call is given the title and the complete outline, told
 * exactly which position it occupies, and told plainly that the sections
 * around it are being written at the same time by someone who can see the
 * same outline. What it must not do is therefore stated rather than left
 * to inference.
 */
export function buildArticleSectionWriterPrompt(input: ArticleSectionWriterInput): { system: string; user: string } {
  const total = input.plan.sections.length;
  const isFirst = input.sectionIndex === 0;
  const isLast = input.sectionIndex === total - 1;

  const positionRules = [
    isFirst
      ? "You are writing the OPENING section. Set up the article. Its first 100 words must contain the primary keyword word for word, as an unbroken phrase, unrephrased."
      : "You are NOT writing the opening. Do not introduce the topic, do not set the scene, and do not open with a definition of the subject — a previous section has already done that. Begin directly on this section's own point.",
    isLast
      ? "You are writing the FINAL section. Close the article here, and land the call to action if one is supplied."
      : "You are NOT writing the final section. Do not summarise the article, do not write a conclusion, and do not include a call to action — a later section does that.",
    "Do not repeat material that the outline assigns to another section. If a point belongs to a section other than yours, leave it to that section, even where it would strengthen your own.",
    "Do not write your own heading — the heading is fixed by the plan and is added around your text. Return the body only.",
    "Do not write any markdown heading inside the body either.",
  ].join("\n- ");

  const system = [
    "You are the Article Writer for a content operations tool, writing ONE section of a longer article.",
    ANGLE_GUIDANCE[input.angle],
    "",
    "Every other section of this article is being written at the same time by a writer given this same outline. The outline is the contract between you: stay inside your section's stated purpose and trust the others to cover theirs.",
    "",
    "Position and boundaries:",
    `- ${positionRules}`,
    "",
    "Content rules:",
    "- Use short paragraphs of 2 to 3 sentences.",
    "- Every factual or inference claim must appear in `claims` with the exact evidence IDs it draws on, and `articleSection` set to this section's heading. Editorial and connective language needs no claim entry.",
    "- The evidence IDs that exist are listed below under \"Evidence IDs you may cite\". That list is exhaustive. Copy an ID from it character for character.",
    "- Evidence IDs are descriptive, never numbered. There is no such ID as S1:E1, S2:E2, or item_3. If you find yourself writing one, you are inventing it — go back to the list and use a real one, or drop the claim.",
    "- Include a relevant link in `links` only where one naturally fits; not every section needs one.",
    "- If the supplied evidence cannot responsibly support this section, write it more cautiously or omit the unsupported specifics rather than inventing them. Set insufficientEvidence=true only if the section cannot be written at all.",
    "",
    SHARED_GROUNDING_RULES,
  ].join("\n");

  const outline = input.plan.sections
    .map((s, i) => {
      const marker = i === input.sectionIndex ? "  <-- YOURS" : "";
      return `${i + 1}. [${s.level}] ${s.heading} — ${s.purpose}${marker}`;
    })
    .join("\n");

  const userParts = [
    `Audience: ${input.audience}`,
    `Objective: ${input.objective}`,
    `Tone: ${input.tone}`,
    input.cta ? `Call to action: ${input.cta}` : null,
    `Article title: ${input.title}`,
    `Angle: ${input.plan.angle}`,
    `Primary keyword: ${input.plan.primaryKeyword}`,
    `Secondary keywords: ${input.plan.secondaryKeywords.join(", ") || "none"}`,
    "",
    `Full article outline (${total} sections):`,
    outline,
    "",
    `Write section ${input.sectionIndex + 1} of ${total}: "${input.section.heading}"`,
    `That section's purpose: ${input.section.purpose}`,
    input.plan.knownLimitations ? `Known limitations from planning: ${input.plan.knownLimitations}` : null,
    "",
    input.evidencePackets.length > 0
      ? `Evidence IDs you may cite (exhaustive):\n${input.evidencePackets
          .map((packet) => `- ${packet.sourceLabel}:${packet.evidenceKey}`)
          .join("\n")}`
      : "No evidence is available to this section — make no factual claims in it.",
    "",
    "Evidence available to this section:",
    formatEvidencePackets(input.evidencePackets),
  ];

  return { system, user: userParts.filter((line): line is string => line !== null).join("\n") };
}

export interface ArticleFrameInput {
  audience: string;
  objective: string;
  tone: string;
  plan: ContentPlan;
}

/**
 * The article's title and meta description, written from the plan alone so
 * this call can run alongside the sections rather than after them.
 */
export function buildArticleFramePrompt(input: ArticleFrameInput): { system: string; user: string } {
  const system = [
    "You are the Article Writer for a content operations tool. Produce only the title and meta description for an article that is being written from the supplied plan.",
    "The title must contain the primary keyword WORD FOR WORD, as an unbroken phrase, with nothing inserted into the middle of it and nothing rephrased — \"AI agents in recruiting\" may appear as \"AI Agents in Recruiting: What Changes in 2026\" but NOT as \"AI Agents Are Transforming Recruiting\". Leading with the exact phrase followed by a colon and a subtitle is the easiest way to satisfy this while still reading well.",
    "The meta description is one sentence of at most 155 characters that describes the article and contains the primary keyword.",
    "Invent no facts: you are naming the article, not reporting on it.",
  ].join("\n");

  const user = [
    `Audience: ${input.audience}`,
    `Objective: ${input.objective}`,
    `Tone: ${input.tone}`,
    `Working title from the plan: ${input.plan.title}`,
    `Primary keyword: ${input.plan.primaryKeyword}`,
    `Angle: ${input.plan.angle}`,
    `Search intent: ${input.plan.searchIntent}`,
    "Planned sections:",
    input.plan.sections.map((s) => `- ${s.heading} (${s.purpose})`).join("\n"),
  ].join("\n");

  return { system, user };
}
