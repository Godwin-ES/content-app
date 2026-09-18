import { z } from "zod";
import { articleClaimSchema, articleLinkSchema } from "@/lib/ai/schemas/article";

/**
 * One section of an article, written on its own.
 *
 * The article used to be produced by a single call that returned every
 * section at once, which made the whole article's latency the sum of its
 * parts — and a long-form article is several thousand output tokens,
 * decoded serially, so that sum was most of the time the pipeline spent.
 * Sections are independent enough to write concurrently (each has its own
 * heading, purpose, and evidence in the plan), so each one is now its own
 * call and the article costs as long as its slowest section rather than
 * all of them end to end.
 *
 * The heading and level come from the plan, not from the model: the plan
 * already decided them, and letting each parallel call re-decide its own
 * heading is how you get an article whose contents no longer match its
 * outline.
 */
export const articleSectionOutputSchema = z.object({
  bodyMarkdown: z.string().min(1),
  /** Only the claims this section makes; the caller concatenates them. */
  claims: z.array(articleClaimSchema).default([]),
  /** Only the links this section uses; the caller merges and de-duplicates. */
  links: z.array(articleLinkSchema).default([]),
  insufficientEvidence: z.boolean().default(false),
  insufficientEvidenceReason: z.string().nullable().default(null),
});

/**
 * The whole-article fields that belong to no single section.
 *
 * Written by its own small call that runs alongside the sections rather
 * than after them: it needs the plan and nothing else, so making it wait
 * for the body would add its latency to a stage whose entire point is that
 * nothing waits for anything it does not need.
 */
export const articleFrameSchema = z.object({
  title: z.string().min(1),
  metaDescription: z.string().min(1),
});

export type ArticleSectionOutput = z.infer<typeof articleSectionOutputSchema>;
export type ArticleFrame = z.infer<typeof articleFrameSchema>;
