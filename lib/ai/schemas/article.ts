import { z } from "zod";

/**
 * Article Writer output (SYSTEM-DESIGN-NEXTJS.md §15). The claim ledger is
 * internal (never shown raw in the public article) and lets the grounding
 * validator and evaluator check every factual/inference claim against
 * supplied evidence IDs.
 */
export const articleClaimSchema = z.object({
  claimId: z.string().min(1),
  claimType: z.enum(["factual", "inference", "editorial"]),
  claimText: z.string().min(1),
  evidenceIds: z.array(z.string()).default([]),
  articleSection: z.string().min(1),
});

export const articleLinkSchema = z.object({
  url: z.string().min(1),
  label: z.string().min(1),
});

export const articleSchema = z.object({
  insufficientEvidence: z.boolean().default(false),
  insufficientEvidenceReason: z.string().nullable().default(null),
  title: z.string().min(1),
  metaDescription: z.string().min(1),
  primaryKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string()).default([]),
  bodyMarkdown: z.string().min(1),
  links: z.array(articleLinkSchema).default([]),
  claims: z.array(articleClaimSchema).default([]),
});

export type ArticleClaim = z.infer<typeof articleClaimSchema>;
export type ArticleOutput = z.infer<typeof articleSchema>;
