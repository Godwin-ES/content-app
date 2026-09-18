import { z } from "zod";

/**
 * Content Planner output (SYSTEM-DESIGN-NEXTJS.md §14). A factual section
 * without evidence coverage should be rejected or rewritten more
 * cautiously before article generation — `evidenceIds` and
 * `hasFactualClaims` give the deterministic validator (Task 11) what it
 * needs to check that.
 */
export const contentPlanSectionSchema = z.object({
  heading: z.string().min(1),
  level: z.enum(["h2", "h3"]),
  purpose: z.string().min(1),
  hasFactualClaims: z.boolean(),
  evidenceIds: z.array(z.string()).default([]),
});

/**
 * A plan's section count is what decides how much the Article Writer is then
 * obliged to produce in one response, since it must return one entry per
 * planned section. Nothing bounded it before: the planner is told to let
 * depth reflect the evidence, so with a rich source set it planned 24
 * sections, and the writer — having no permission to consolidate — ran into
 * the provider's output ceiling and was cut off mid-sentence.
 *
 * Enforced here rather than only asked for in the prompt, so an
 * over-long plan fails loudly at generation instead of silently producing a
 * half-written article two steps later. Manual plan edits validate through
 * validateContentPlan() instead, so an existing longer plan stays editable.
 */
/**
 * Lowered from 16 once section count was understood to be the main thing
 * deciding how long an article takes to write: a 16-section article is
 * four times the output of a four-section one, and nothing about the
 * deliverable needed sixteen. Six leaves room for a real structure and
 * bounds the worst case.
 */
export const MAX_PLAN_SECTIONS = 6;
export const MIN_PLAN_SECTIONS = 3;

export const contentPlanSchema = z.object({
  insufficientEvidence: z.boolean().default(false),
  insufficientEvidenceReason: z.string().nullable().default(null),
  primaryKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string()).default([]),
  searchIntent: z.string().min(1),
  angle: z.string().min(1),
  title: z.string().min(1),
  sections: z.array(contentPlanSectionSchema).min(MIN_PLAN_SECTIONS).max(MAX_PLAN_SECTIONS),
  ctaDirection: z.string().nullable().default(null),
  links: z.array(z.string()).default([]),
  knownLimitations: z.string().nullable().default(null),
});

export type ContentPlanSection = z.infer<typeof contentPlanSectionSchema>;
export type ContentPlan = z.infer<typeof contentPlanSchema>;
