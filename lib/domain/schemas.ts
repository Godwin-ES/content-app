import { z } from "zod";

const MAX_SOURCE_URLS = 10;
const MAX_ADDITIONAL_INSTRUCTIONS_LENGTH = 8000;

/**
 * Intake validation. Topic is the only hard requirement (SYSTEM-DESIGN-NEXTJS.md #4.8, #7).
 * Runs before any research/retrieval/AI provider call so invalid input fails cheaply (#7.4).
 */
export const contentRequestInputSchema = z.object({
  topic: z.string().trim().min(1, "Topic is required."),
  audience: z.string().trim().min(1).optional(),
  objective: z.string().trim().min(1).optional(),
  tone: z.string().trim().min(1).optional(),
  cta: z.string().trim().min(1).optional(),
  primaryKeyword: z.string().trim().min(1).optional(),
  sourceUrls: z
    .array(z.string().trim().url("Each source URL must be a valid URL."))
    .max(MAX_SOURCE_URLS, `At most ${MAX_SOURCE_URLS} source URLs are allowed at intake.`)
    .optional(),
  additionalInstructions: z
    .string()
    .trim()
    .max(
      MAX_ADDITIONAL_INSTRUCTIONS_LENGTH,
      `Additional instructions must be ${MAX_ADDITIONAL_INSTRUCTIONS_LENGTH} characters or fewer.`
    )
    .optional(),
  publicationDate: z.string().trim().min(1).optional(),
  suppliedSourcesOnly: z.boolean().optional(),
});

export type ContentRequestInputParsed = z.infer<typeof contentRequestInputSchema>;
