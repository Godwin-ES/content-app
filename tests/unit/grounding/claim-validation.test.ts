import { describe, expect, it } from "vitest";
import { validateClaimEvidence } from "@/lib/grounding/claim-validation";
import type { ArticleClaim } from "@/lib/ai/schemas/article";

function claim(overrides: Partial<ArticleClaim> = {}): ArticleClaim {
  return {
    claimId: "C1",
    claimType: "factual",
    claimText: "Some teams reported reduced workload.",
    evidenceIds: ["S1:E1"],
    articleSection: "Introduction",
    ...overrides,
  };
}

describe("validateClaimEvidence", () => {
  it("accepts a factual claim citing a valid evidence ID", () => {
    expect(() => validateClaimEvidence([claim()], new Set(["S1:E1"]))).not.toThrow();
  });

  it("rejects a factual claim citing no evidence", () => {
    expect(() => validateClaimEvidence([claim({ evidenceIds: [] })], new Set(["S1:E1"]))).toThrow(/cites no evidence/i);
  });

  it("rejects an inference claim citing no evidence", () => {
    expect(() =>
      validateClaimEvidence([claim({ claimType: "inference", evidenceIds: [] })], new Set(["S1:E1"]))
    ).toThrow(/cites no evidence/i);
  });

  it("rejects a claim citing an evidence ID outside the current source set", () => {
    expect(() => validateClaimEvidence([claim({ evidenceIds: ["S9:E9"] })], new Set(["S1:E1"]))).toThrow(/unknown evidence/i);
  });

  it("does not require evidence for an editorial claim", () => {
    expect(() =>
      validateClaimEvidence([claim({ claimType: "editorial", evidenceIds: [] })], new Set())
    ).not.toThrow();
  });

  it("validates every claim in the ledger, not just the first", () => {
    const claims = [claim({ claimId: "C1" }), claim({ claimId: "C2", evidenceIds: ["S9:E9"] })];
    expect(() => validateClaimEvidence(claims, new Set(["S1:E1"]))).toThrow(/C2/);
  });
});
