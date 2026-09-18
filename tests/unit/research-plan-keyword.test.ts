import { describe, it, expect } from "vitest";
import { FakeAIProvider } from "@/lib/ai/providers/fake";
import { createResearchPlan } from "@/lib/ai/service";

const INPUT = {
  topic: "AI agents in recruiting",
  audience: "HR leaders",
  objective: "Educate",
  tone: "Professional",
  primaryKeyword: null,
};

function plan(primaryKeyword: string, searchQueries: string[]) {
  return {
    primaryKeyword,
    secondaryKeywords: [],
    searchIntent: "informational",
    researchQuestions: ["What do they do?"],
    searchQueries,
    usefulSourceCategories: [],
  };
}

describe("createResearchPlan keyword binding", () => {
  it("accepts a plan whose queries search for its own keyword", async () => {
    const provider = new FakeAIProvider([
      plan("ai recruiting agents", ["ai recruiting agents 2026", "hiring automation trends", "recruiter workload study"]),
    ]);
    const result = await createResearchPlan(provider, "fake-model", INPUT);
    expect(result.primaryKeyword).toBe("ai recruiting agents");
  });

  it("matches the keyword across punctuation and casing", async () => {
    const provider = new FakeAIProvider([
      plan("four-day work week", ["Four Day Work Week evidence", "productivity studies", "shorter hours research"]),
    ]);
    await expect(createResearchPlan(provider, "fake-model", INPUT)).resolves.toBeTruthy();
  });

  it("re-asks when no query looks for the keyword, and accepts the retry", async () => {
    const provider = new FakeAIProvider([
      plan("ai recruiting agents", ["hiring automation", "recruiter workload", "talent trends"]),
      plan("ai recruiting agents", ["what are ai recruiting agents", "hiring automation", "talent trends"]),
    ]);
    const result = await createResearchPlan(provider, "fake-model", INPUT);
    expect(result.searchQueries[0]).toBe("what are ai recruiting agents");
  });

  it("fails rather than researching a keyword nothing searches for", async () => {
    const mismatched = plan("ai recruiting agents", ["hiring automation", "recruiter workload", "talent trends"]);
    const provider = new FakeAIProvider([mismatched, mismatched, mismatched]);

    await expect(createResearchPlan(provider, "fake-model", INPUT)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      stage: "research_planning",
    });
  });
});

describe("keyword coverage matching", () => {
  it("accepts a query that drops a stop word from the keyword", async () => {
    // "ai agents recruiting" is unmistakably searching for "ai agents in
    // recruiting"; failing it over a missing "in" would reject real work.
    const provider = new FakeAIProvider([
      plan("ai agents in recruiting", ["ai agents recruiting", "screening tools", "hiring automation"]),
    ]);
    await expect(createResearchPlan(provider, "fake-model", INPUT)).resolves.toBeTruthy();
  });

  it("does not let a short keyword word match inside an unrelated word", async () => {
    // "ai" as a substring appears in "training" and "email". Matching on
    // substrings would make almost any query satisfy a keyword with a
    // two-letter word in it.
    const mismatched = plan("ai agents", ["training email templates", "detail checklists", "retail hiring"]);
    const provider = new FakeAIProvider([mismatched, mismatched, mismatched]);
    await expect(createResearchPlan(provider, "fake-model", INPUT)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
