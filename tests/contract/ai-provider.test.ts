// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeAIProvider } from "@/lib/ai/providers/fake";
import { AnthropicAIProvider } from "@/lib/ai/providers/anthropic";
import { GoogleAIProvider } from "@/lib/ai/providers/google";
import { createResearchPlan, generateArticle, evaluateArticle } from "@/lib/ai/service";
import type { ArticleOutput } from "@/lib/ai/schemas/article";

const VALID_RESEARCH_PLAN = {
  primaryKeyword: "ai agents in recruiting",
  secondaryKeywords: ["recruiting automation"],
  searchIntent: "informational",
  researchQuestions: ["How are AI agents used in recruiting today?"],
  searchQueries: ["AI agents recruiting 2026", "AI recruiting automation case study", "AI screening tools HR"],
  usefulSourceCategories: ["industry reports", "vendor case studies"],
};

const VALID_ARTICLE: ArticleOutput = {
  insufficientEvidence: false,
  insufficientEvidenceReason: null,
  title: "AI Agents in Recruiting",
  metaDescription: "How AI agents are reshaping recruiting workflows.",
  primaryKeyword: "ai agents in recruiting",
  secondaryKeywords: [],
  sections: [{ heading: "Introduction", level: "h2", bodyMarkdown: "Some teams reported reduced administrative workload." }],
  links: [],
  claims: [
    {
      claimId: "C1",
      claimType: "factual",
      claimText: "Some teams reported reduced administrative workload.",
      evidenceIds: ["S1:E1"],
      articleSection: "Introduction",
    },
  ],
};

const VALID_EVALUATION = {
  overallStatus: "pass" as const,
  criteria: [
    { criterion: "topic_relevance" as const, score: 5, finding: "On topic.", location: null, recommendedAction: null },
    { criterion: "source_grounding" as const, score: 5, finding: "Well grounded.", location: null, recommendedAction: null },
    { criterion: "factual_consistency" as const, score: 5, finding: "Consistent.", location: null, recommendedAction: null },
  ],
  claimAudit: [{ claimId: "C1", status: "supported" as const, note: null }],
  unsupportedClaims: [],
  sectionsNeedingRevision: [],
  revisionInstructions: null,
};

describe("generateStructured (fake provider)", () => {
  it("returns valid, schema-parsed data for a queued valid response", async () => {
    const provider = new FakeAIProvider([VALID_RESEARCH_PLAN]);
    const plan = await createResearchPlan(provider, "fake-model", {
      topic: "AI agents in recruiting",
      audience: "HR leaders",
      objective: "Educate",
      tone: "Professional",
      primaryKeyword: null,
    });
    expect(plan.primaryKeyword).toBe("ai agents in recruiting");
    expect(plan.searchQueries.length).toBeGreaterThanOrEqual(3);
  });

  it("never returns schema-invalid output as typed application data", async () => {
    const provider = new FakeAIProvider([{ notEvenClose: true }]);
    await expect(
      createResearchPlan(provider, "fake-model", {
        topic: "AI agents",
        audience: "HR leaders",
        objective: "Educate",
        tone: "Professional",
        primaryKeyword: null,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an article missing the required claim ledger shape", async () => {
    const provider = new FakeAIProvider([{ ...VALID_ARTICLE, claims: [{ claimId: "C1" }] }]);
    await expect(
      generateArticle(provider, "fake-model", {
        angle: "practical",
        audience: "HR leaders",
        objective: "Educate",
        tone: "Professional",
        cta: null,
        plan: {
          insufficientEvidence: false,
          insufficientEvidenceReason: null,
          primaryKeyword: "ai agents",
          secondaryKeywords: [],
          searchIntent: "informational",
          angle: "practical",
          title: "Title",
          sections: [],
          ctaDirection: null,
          links: [],
          knownLimitations: null,
        },
        evidencePackets: [],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("produces a typed evaluation from a queued valid response", async () => {
    const provider = new FakeAIProvider([VALID_EVALUATION]);
    const evaluation = await evaluateArticle(provider, "fake-model", {
      audience: "HR leaders",
      objective: "Educate",
      tone: "Professional",
      article: VALID_ARTICLE,
      evidencePackets: [],
    });
    expect(evaluation.overallStatus).toBe("pass");
    expect(evaluation.claimAudit[0]?.status).toBe("supported");
  });
});

const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
const hasGoogleKey = Boolean(process.env.GOOGLE_AI_API_KEY);

const trivialSchema = z.object({ answer: z.literal("ok") });

describe.skipIf(!hasAnthropicKey)("generateStructured (live Anthropic contract check)", () => {
  it("returns schema-valid structured output from a real Claude call", async () => {
    const provider = new AnthropicAIProvider();
    const result = await provider.generateStructured({
      modelId: process.env.ANTHROPIC_HAIKU_MODEL!,
      system: "You must call the tool with exactly the literal string \"ok\" for the answer field.",
      user: "Respond now.",
      schema: trivialSchema,
    });
    expect(result.answer).toBe("ok");
  }, 30000);
});

describe.skipIf(!hasGoogleKey)("generateStructured (live Google contract check)", () => {
  it("returns schema-valid structured output from a real Gemini call", async () => {
    const provider = new GoogleAIProvider();
    const result = await provider.generateStructured({
      modelId: process.env.GOOGLE_GEMINI_MODEL!,
      system: "You must respond with exactly the literal string \"ok\" for the answer field.",
      user: "Respond now.",
      schema: trivialSchema,
    });
    expect(result.answer).toBe("ok");
  }, 30000);
});
