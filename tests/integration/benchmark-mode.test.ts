import { describe, expect, it } from "vitest";
import { FakeAIProvider } from "@/lib/ai/providers/fake";
import { loadBenchmarkScenarios, runBenchmarkScenario } from "@/lib/benchmark/service";

function articleContent(overrides: Record<string, unknown> = {}) {
  return {
    insufficientEvidence: false,
    insufficientEvidenceReason: null,
    title: "AI Agents in Recruiting: A Practical Guide",
    metaDescription: "meta",
    primaryKeyword: "ai agents in recruiting",
    secondaryKeywords: [],
    sections: [{ heading: "Overview", level: "h2", bodyMarkdown: "Some surveyed companies reported reduced screening time." }],
    links: [{ url: "https://example.com/a", label: "Source" }],
    claims: [
      {
        claimId: "C1",
        claimType: "factual",
        claimText: "Some surveyed companies reported reduced screening time.",
        evidenceIds: ["S1:E1"],
        articleSection: "What AI recruiting agents actually do",
      },
    ],
    ...overrides,
  };
}

function passingEvaluation() {
  return {
    overallStatus: "pass" as const,
    criteria: [{ criterion: "topic_relevance" as const, score: 5, finding: "ok", location: null, recommendedAction: null }],
    claimAudit: [{ claimId: "C1", status: "supported" as const, note: null }],
    unsupportedClaims: [],
    sectionsNeedingRevision: [],
    revisionInstructions: null,
  };
}

function revisableEvaluation() {
  return { ...passingEvaluation(), overallStatus: "revise" as const, revisionInstructions: "Tighten the intro." };
}

function linkedinContent() {
  return { body: "A LinkedIn post about AI recruiting agents.", hasCallToAction: true };
}

function channelEvaluation() {
  return {
    overallStatus: "pass" as const,
    channelFit: 5,
    certaintyInflationDetected: false,
    findings: ["Reads naturally."],
    recommendedAction: null,
  };
}

describe("benchmark mode (deterministic fake-provider run)", () => {
  it("loads all six frozen scenarios", async () => {
    const scenarios = await loadBenchmarkScenarios();
    expect(scenarios.map((s) => s.key).sort()).toEqual(
      ["channel_compression", "conflicting_sources", "prompt_injection", "seo_pressure", "thin_evidence", "well_sourced"].sort()
    );
  });

  it("runs a well-sourced scenario end to end with no ungrounded claims", async () => {
    const scenarios = await loadBenchmarkScenarios();
    const scenario = scenarios.find((s) => s.key === "well_sourced")!;
    const ai = new FakeAIProvider([articleContent(), passingEvaluation(), linkedinContent(), channelEvaluation()]);

    const result = await runBenchmarkScenario(ai, "fake-model", scenario);

    expect(result.article.ok).toBe(true);
    expect(result.claimsWithoutEvidence).toHaveLength(0);
    expect(result.evaluation.value?.overallStatus).toBe("pass");
    expect(result.revisedArticle).toBeNull();
    expect(result.linkedinPost.ok).toBe(true);
    expect(result.channelEvaluation.value?.certaintyInflationDetected).toBe(false);
  });

  it("flags a claim that cites unknown evidence without crashing the run", async () => {
    const scenarios = await loadBenchmarkScenarios();
    const scenario = scenarios.find((s) => s.key === "well_sourced")!;
    const ungroundedArticle = articleContent({
      claims: [
        {
          claimId: "C1",
          claimType: "factual",
          claimText: "This claim cites a source that was never reviewed.",
          evidenceIds: ["S9:E9"],
          articleSection: "What AI recruiting agents actually do",
        },
      ],
    });
    const ai = new FakeAIProvider([ungroundedArticle, passingEvaluation(), linkedinContent(), channelEvaluation()]);

    const result = await runBenchmarkScenario(ai, "fake-model", scenario);

    expect(result.article.ok).toBe(true);
    expect(result.claimsWithoutEvidence).toEqual(["This claim cites a source that was never reviewed."]);
  });

  it("records a malformed article as a failed step and safely skips downstream steps", async () => {
    const scenarios = await loadBenchmarkScenarios();
    const scenario = scenarios.find((s) => s.key === "well_sourced")!;
    const ai = new FakeAIProvider([{ notAnArticle: true }]);

    const result = await runBenchmarkScenario(ai, "fake-model", scenario);

    expect(result.article.ok).toBe(false);
    expect(result.article.error).toBeTruthy();
    expect(result.evaluation.ok).toBe(false);
    expect(result.linkedinPost.ok).toBe(false);
    expect(result.channelEvaluation.ok).toBe(false);
  });

  it("runs the revision step when the evaluator returns 'revise', and adapts the revised article", async () => {
    const scenarios = await loadBenchmarkScenarios();
    const scenario = scenarios.find((s) => s.key === "well_sourced")!;
    const revisedArticle = articleContent({ title: "AI Agents in Recruiting: A Tighter Guide" });
    const ai = new FakeAIProvider([articleContent(), revisableEvaluation(), revisedArticle, linkedinContent(), channelEvaluation()]);

    const result = await runBenchmarkScenario(ai, "fake-model", scenario);

    expect(result.evaluation.value?.overallStatus).toBe("revise");
    expect(result.revisedArticle?.ok).toBe(true);
    expect(result.revisedArticle?.value?.title).toBe("AI Agents in Recruiting: A Tighter Guide");
  });
});
