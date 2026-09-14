import { z } from "zod";

/**
 * Article Evaluator output (SYSTEM-DESIGN-NEXTJS.md §17). `overallStatus`
 * is the model's own judgment call, but the application never trusts it
 * blindly: semantic validation (Task 13) rejects internally inconsistent
 * combinations (e.g. `pass` alongside a serious unsupported claim) before
 * this is treated as authoritative.
 */
export const EVALUATION_CRITERIA = [
  "topic_relevance",
  "source_grounding",
  "factual_consistency",
  "audience_fit",
  "tone",
  "seo_fit",
  "clarity",
  "completeness",
] as const;

export const evaluationCriterionSchema = z.object({
  criterion: z.enum(EVALUATION_CRITERIA),
  score: z.number().int().min(1).max(5),
  finding: z.string().min(1),
  location: z.string().nullable().default(null),
  recommendedAction: z.string().nullable().default(null),
});

export const claimAuditEntrySchema = z.object({
  claimId: z.string().min(1),
  status: z.enum(["supported", "unsupported", "overreaching"]),
  note: z.string().nullable().default(null),
});

export const evaluationSchema = z.object({
  overallStatus: z.enum(["pass", "revise", "reject"]),
  criteria: z.array(evaluationCriterionSchema).min(1),
  claimAudit: z.array(claimAuditEntrySchema).default([]),
  unsupportedClaims: z.array(z.string()).default([]),
  sectionsNeedingRevision: z.array(z.string()).default([]),
  revisionInstructions: z.string().nullable().default(null),
});

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];
export type Evaluation = z.infer<typeof evaluationSchema>;
