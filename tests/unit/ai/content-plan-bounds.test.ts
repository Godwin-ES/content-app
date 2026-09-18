import { describe, expect, it } from "vitest";
import { contentPlanSchema, MAX_PLAN_SECTIONS, MIN_PLAN_SECTIONS } from "@/lib/ai/schemas/content-plan";

const section = (heading: string) => ({
  heading,
  level: "h2" as const,
  purpose: "explain something",
  hasFactualClaims: false,
  evidenceIds: [],
});

const plan = (sectionCount: number) => ({
  primaryKeyword: "ai agents in recruiting",
  searchIntent: "informational",
  angle: "practical",
  title: "AI Agents in Recruiting",
  sections: Array.from({ length: sectionCount }, (_, i) => section(`Section ${i + 1}`)),
});

/**
 * The writer must return one entry per planned section in a single
 * response, so an unbounded plan is what put a 24-section outline into an
 * 8k-token output ceiling and got the article cut off mid-sentence. The cap
 * lives in the schema so an over-long plan fails at generation rather than
 * silently producing a half-written article two steps later.
 */
describe("content plan section bounds", () => {
  it("accepts a plan within the bounds", () => {
    expect(contentPlanSchema.safeParse(plan(MIN_PLAN_SECTIONS)).success).toBe(true);
    // A midpoint, derived rather than hardcoded so lowering the cap does
    // not turn a valid plan into a failing test.
    expect(contentPlanSchema.safeParse(plan(Math.floor((MIN_PLAN_SECTIONS + MAX_PLAN_SECTIONS) / 2))).success).toBe(true);
    expect(contentPlanSchema.safeParse(plan(MAX_PLAN_SECTIONS)).success).toBe(true);
  });

  it("rejects a plan too long for the writer to produce in one response", () => {
    const result = contentPlanSchema.safeParse(plan(MAX_PLAN_SECTIONS + 1));
    expect(result.success).toBe(false);
    // The real plan that triggered this had 24.
    expect(contentPlanSchema.safeParse(plan(24)).success).toBe(false);
  });

  it("rejects a plan with too few sections to be an article", () => {
    expect(contentPlanSchema.safeParse(plan(MIN_PLAN_SECTIONS - 1)).success).toBe(false);
    expect(contentPlanSchema.safeParse(plan(0)).success).toBe(false);
  });
});
