import { z } from "zod";

/**
 * Channel adapter outputs (SYSTEM-DESIGN-NEXTJS.md §21). Each channel has
 * its own narrow schema; adapters never conduct new research and must not
 * increase certainty/specificity beyond the source article (checked by the
 * channel evaluator below, not by these schemas).
 */
export const linkedinPostSchema = z.object({
  body: z.string().min(1),
  hasCallToAction: z.boolean(),
});

export const xPostSchema = z.object({
  body: z.string().min(1),
  hashtags: z.array(z.string()).max(2).default([]),
});

export const newsletterSchema = z.object({
  subject: z.string().min(1),
  introduction: z.string().min(1),
  bodyMarkdown: z.string().min(1),
  callToAction: z.string().min(1),
  signoff: z.string().min(1),
});

export const channelEvaluationSchema = z.object({
  overallStatus: z.enum(["pass", "revise", "reject"]),
  channelFit: z.number().int().min(1).max(5),
  certaintyInflationDetected: z.boolean(),
  findings: z.array(z.string()).default([]),
  recommendedAction: z.string().nullable().default(null),
});

export type LinkedinPost = z.infer<typeof linkedinPostSchema>;
export type XPost = z.infer<typeof xPostSchema>;
export type Newsletter = z.infer<typeof newsletterSchema>;
export type ChannelEvaluation = z.infer<typeof channelEvaluationSchema>;
