import { describe, expect, it } from "vitest";
import { validateEvaluationConsistency } from "@/lib/grounding/semantic-validation";
import type { Evaluation } from "@/lib/ai/schemas/evaluation";

function baseEvaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    overallStatus: "pass",
    criteria: [
      { criterion: "topic_relevance", score: 5, finding: "ok", location: null, recommendedAction: null },
      { criterion: "source_grounding", score: 5, finding: "ok", location: null, recommendedAction: null },
      { criterion: "factual_consistency", score: 5, finding: "ok", location: null, recommendedAction: null },
    ],
    claimAudit: [{ claimId: "C1", status: "supported", note: null }],
    unsupportedClaims: [],
    sectionsNeedingRevision: [],
    revisionInstructions: null,
    ...overrides,
  };
}

describe("validateEvaluationConsistency", () => {
  it("accepts a genuinely consistent passing evaluation", () => {
    expect(() => validateEvaluationConsistency(baseEvaluation(), new Set(["C1"]))).not.toThrow();
  });

  it("rejects PASS while a claim audit entry is unsupported", () => {
    const evaluation = baseEvaluation({ claimAudit: [{ claimId: "C1", status: "unsupported", note: null }] });
    expect(() => validateEvaluationConsistency(evaluation, new Set(["C1"]))).toThrow(/pass/i);
  });

  it("rejects PASS while unsupportedClaims lists a claim", () => {
    const evaluation = baseEvaluation({ unsupportedClaims: ["C1"] });
    expect(() => validateEvaluationConsistency(evaluation, new Set(["C1"]))).toThrow(/pass/i);
  });

  it("rejects a perfect Source Grounding score alongside multiple unsupported claim audits", () => {
    const evaluation = baseEvaluation({
      overallStatus: "revise",
      claimAudit: [
        { claimId: "C1", status: "unsupported", note: null },
        { claimId: "C2", status: "overreaching", note: null },
      ],
    });
    expect(() => validateEvaluationConsistency(evaluation, new Set(["C1", "C2"]))).toThrow(/source grounding/i);
  });

  it("rejects a claim audit entry referencing an unknown claim ID", () => {
    const evaluation = baseEvaluation({ claimAudit: [{ claimId: "C99", status: "supported", note: null }] });
    expect(() => validateEvaluationConsistency(evaluation, new Set(["C1"]))).toThrow(/unknown claim/i);
  });

  it("rejects PASS when Source Grounding scores below 4", () => {
    const evaluation = baseEvaluation({
      criteria: [
        { criterion: "topic_relevance", score: 5, finding: "ok", location: null, recommendedAction: null },
        { criterion: "source_grounding", score: 3, finding: "weak", location: null, recommendedAction: null },
        { criterion: "factual_consistency", score: 5, finding: "ok", location: null, recommendedAction: null },
      ],
    });
    expect(() => validateEvaluationConsistency(evaluation, new Set(["C1"]))).toThrow(/source grounding/i);
  });

  it("rejects PASS when Factual Consistency scores below 4", () => {
    const evaluation = baseEvaluation({
      criteria: [
        { criterion: "topic_relevance", score: 5, finding: "ok", location: null, recommendedAction: null },
        { criterion: "source_grounding", score: 5, finding: "ok", location: null, recommendedAction: null },
        { criterion: "factual_consistency", score: 2, finding: "weak", location: null, recommendedAction: null },
      ],
    });
    expect(() => validateEvaluationConsistency(evaluation, new Set(["C1"]))).toThrow(/factual consistency/i);
  });

  it("allows a low Source Grounding score when the status is already revise/reject", () => {
    const evaluation = baseEvaluation({
      overallStatus: "revise",
      criteria: [
        { criterion: "topic_relevance", score: 5, finding: "ok", location: null, recommendedAction: null },
        { criterion: "source_grounding", score: 2, finding: "weak", location: null, recommendedAction: null },
        { criterion: "factual_consistency", score: 5, finding: "ok", location: null, recommendedAction: null },
      ],
    });
    expect(() => validateEvaluationConsistency(evaluation, new Set(["C1"]))).not.toThrow();
  });
});
