import { z } from "zod";

/**
 * Research Planner output (SYSTEM-DESIGN-NEXTJS.md §9.1). Converts the
 * request into search direction only — it must not claim research has
 * already proved anything, since no sources have been retrieved yet.
 */
export const researchPlanSchema = z.object({
  primaryKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string()).default([]),
  searchIntent: z.string().min(1),
  researchQuestions: z.array(z.string()).min(1),
  searchQueries: z.array(z.string()).min(3).max(6),
  usefulSourceCategories: z.array(z.string()).default([]),
});

export type ResearchPlan = z.infer<typeof researchPlanSchema>;
