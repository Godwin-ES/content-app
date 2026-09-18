import { z } from "zod";

/**
 * Intake validation. Topic is the only hard requirement (SYSTEM-DESIGN-NEXTJS.md #4.8, #7).
 * Runs before any research/retrieval/AI provider call so invalid input fails cheaply (#7.4).
 *
 * Supplied URLs are deliberately absent: they are not a property of the
 * request but sources in their own right, created as `research_sources`
 * rows with origin `user_url` the moment they are added, so they can be
 * retried, excluded, and shown with everything else research found.
 */
export const contentRequestInputSchema = z.object({
  topic: z.string().trim().min(1, "Topic is required."),
  audience: z.string().trim().min(1).optional(),
  objective: z.string().trim().min(1).optional(),
  tone: z.string().trim().min(1).optional(),
  cta: z.string().trim().min(1).optional(),
  primaryKeyword: z.string().trim().min(1).optional(),
  suppliedSourcesOnly: z.boolean().optional(),
});

export type ContentRequestInputParsed = z.infer<typeof contentRequestInputSchema>;
