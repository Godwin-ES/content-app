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

export const contentPlanSchema = z.object({
  insufficientEvidence: z.boolean().default(false),
  insufficientEvidenceReason: z.string().nullable().default(null),
  primaryKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string()).default([]),
  searchIntent: z.string().min(1),
  angle: z.string().min(1),
  title: z.string().min(1),
  sections: z.array(contentPlanSectionSchema).default([]),
  ctaDirection: z.string().nullable().default(null),
  links: z.array(z.string()).default([]),
  knownLimitations: z.string().nullable().default(null),
});

export type ContentPlanSection = z.infer<typeof contentPlanSectionSchema>;
export type ContentPlan = z.infer<typeof contentPlanSchema>;
