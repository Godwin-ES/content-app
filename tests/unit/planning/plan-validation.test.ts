import { describe, expect, it } from "vitest";
import { validateContentPlan } from "@/lib/planning/service";
import type { ContentPlan } from "@/lib/ai/schemas/content-plan";

function basePlan(overrides: Partial<ContentPlan> = {}): ContentPlan {
  return {
    insufficientEvidence: false,
    insufficientEvidenceReason: null,
    primaryKeyword: "ai agents in recruiting",
    secondaryKeywords: [],
    searchIntent: "informational",
    angle: "practical",
    title: "AI Agents in Recruiting",
    sections: [],
    ctaDirection: null,
    links: [],
    knownLimitations: null,
    ...overrides,
  };
}

describe("validateContentPlan", () => {
  it("accepts a plan whose factual sections reference valid evidence IDs", () => {
    const plan = basePlan({
      sections: [{ heading: "Intro", level: "h2", purpose: "intro", hasFactualClaims: true, evidenceIds: ["S1:E1"] }],
    });
    expect(() => validateContentPlan(plan, new Set(["S1:E1"]))).not.toThrow();
  });

  it("rejects a factual section with no evidence IDs", () => {
    const plan = basePlan({
      sections: [{ heading: "Intro", level: "h2", purpose: "intro", hasFactualClaims: true, evidenceIds: [] }],
    });
    expect(() => validateContentPlan(plan, new Set(["S1:E1"]))).toThrow(/evidence/i);
  });

  it("rejects a section referencing an evidence ID outside the current source set", () => {
    const plan = basePlan({
      sections: [{ heading: "Intro", level: "h2", purpose: "intro", hasFactualClaims: true, evidenceIds: ["S9:E9"] }],
    });
    expect(() => validateContentPlan(plan, new Set(["S1:E1"]))).toThrow(/unknown evidence/i);
  });

  it("does not require evidence for a non-factual (editorial) section", () => {
    const plan = basePlan({
      sections: [{ heading: "Conclusion", level: "h2", purpose: "wrap up", hasFactualClaims: false, evidenceIds: [] }],
    });
    expect(() => validateContentPlan(plan, new Set())).not.toThrow();
  });

  it("rejects a plan missing a title", () => {
    const plan = basePlan({ title: "" });
    expect(() => validateContentPlan(plan, new Set())).toThrow(/title/i);
  });

  it("rejects a plan missing a primary keyword", () => {
    const plan = basePlan({ primaryKeyword: "" });
    expect(() => validateContentPlan(plan, new Set())).toThrow(/keyword/i);
  });
});
