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
  evidence: z.array(sourceEvidenceItemSchema).default([]),
});

export type SourceEvidenceItem = z.infer<typeof sourceEvidenceItemSchema>;
export type SourceAnalysis = z.infer<typeof sourceAnalysisSchema>;
