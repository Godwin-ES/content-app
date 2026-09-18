import { z } from "zod";

/**
 * Source Analyzer output for one retrieved source (SYSTEM-DESIGN-NEXTJS.md §11).
 * Each evidence item states explicit `supports`/`doesNotEstablish` boundaries
 * so downstream writing has clear evidentiary limits rather than a raw page.
 */
export const sourceEvidenceItemSchema = z.object({
  evidenceKey: z.string().min(1),
  excerpt: z.string().min(1),
  conservativeSummary: z.string().min(1),
  supports: z.array(z.string()).default([]),
  doesNotEstablish: z.array(z.string()).default([]),
});

export const sourceAnalysisSchema = z.object({
  isUsable: z.boolean(),
  relevanceSummary: z.string().min(1),
  /**
   * Whether this source is worth keeping for this topic, and why in one
   * sentence.
   *
   * Separate from `isUsable`, which only says the page could be read and
   * had substance in it. A well-written page about something else is
   * perfectly usable and perfectly useless, and that distinction is
   * exactly what source review exists to make. Shown as a recommendation
   * and acted on by auto mode; the decision itself stays a person's.
   */
  recommendation: z.enum(["accept", "exclude"]),
  recommendationReason: z.string().min(1).max(240),
  evidence: z.array(sourceEvidenceItemSchema).default([]),
});

export type SourceEvidenceItem = z.infer<typeof sourceEvidenceItemSchema>;
export type SourceAnalysis = z.infer<typeof sourceAnalysisSchema>;
