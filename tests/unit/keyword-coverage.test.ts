import { describe, it, expect } from "vitest";
import { assessKeywordCoverage, type KeywordCoverageSource } from "@/lib/research/keyword-coverage";

const source = (over: Partial<KeywordCoverageSource> = {}): KeywordCoverageSource => ({
  id: "s1",
  title: null,
  extractedText: null,
  origin: "researched",
  ...over,
});

describe("assessKeywordCoverage", () => {
  it("does not assess when the request has no primary keyword yet", () => {
    const result = assessKeywordCoverage(null, [source({ extractedText: "anything" })]);
    expect(result.assessed).toBe(false);
    expect(result.covered).toBe(true);
    expect(result.blocking).toBe(false);
  });

  it("does not assess before there are any sources", () => {
    const result = assessKeywordCoverage("ai recruiting agents", []);
    expect(result.assessed).toBe(false);
    expect(result.blocking).toBe(false);
  });

  it("matches the keyword phrase across punctuation and casing", () => {
    const result = assessKeywordCoverage("four-day work week", [
      source({ extractedText: "Companies trialling the Four Day Work Week report higher output." }),
    ]);
    expect(result.phraseMatchIds).toEqual(["s1"]);
    expect(result.covered).toBe(true);
    expect(result.message).toContain("1 source uses the phrase");
  });

  it("matches the title as well as the body", () => {
    const result = assessKeywordCoverage("ai recruiting agents", [
      source({ title: "AI Recruiting Agents, Explained", extractedText: "Body text about something else." }),
    ]);
    expect(result.phraseMatchIds).toEqual(["s1"]);
  });

  it("falls back to every content word when the exact phrase is absent", () => {
    const result = assessKeywordCoverage("ai agents in recruiting", [
      source({ extractedText: "These AI agents are changing how recruiting teams work." }),
    ]);
    expect(result.phraseMatchIds).toEqual([]);
    expect(result.termMatchIds).toEqual(["s1"]);
    expect(result.covered).toBe(true);
    expect(result.message).toContain("all of its terms");
  });

  it("ignores stop words, so a shared 'in' is not coverage", () => {
    const result = assessKeywordCoverage("ai agents in recruiting", [
      source({ extractedText: "A report on hiring trends in Europe." }),
    ]);
    expect(result.covered).toBe(false);
  });

  it("blocks when researched sources miss the keyword entirely", () => {
    const result = assessKeywordCoverage("ai recruiting agents", [
      source({ id: "a", extractedText: "An article about warehouse robotics." }),
      source({ id: "b", extractedText: "An article about payroll software." }),
    ]);
    expect(result.covered).toBe(false);
    expect(result.blocking).toBe(true);
    expect(result.message).toContain("Change the primary keyword");
  });

  it("warns but does not block when the evidence is all the user's own", () => {
    const result = assessKeywordCoverage("ai recruiting agents", [
      source({ id: "a", origin: "user_url", extractedText: "An internal note about payroll." }),
      source({ id: "b", origin: "uploaded_material", extractedText: "A deck about onboarding." }),
    ]);
    expect(result.covered).toBe(false);
    expect(result.suppliedOnly).toBe(true);
    expect(result.blocking).toBe(false);
    expect(result.message).toContain("only a warning");
  });

  it("blocks when even one researched source is in the mix", () => {
    const result = assessKeywordCoverage("ai recruiting agents", [
      source({ id: "a", origin: "user_url", extractedText: "An internal note about payroll." }),
      source({ id: "b", origin: "researched", extractedText: "An article about warehouse robotics." }),
    ]);
    expect(result.suppliedOnly).toBe(false);
    expect(result.blocking).toBe(true);
  });

  it("skips a source with no retrievable text rather than counting it as a match", () => {
    const result = assessKeywordCoverage("ai recruiting agents", [source({ title: null, extractedText: null })]);
    expect(result.covered).toBe(false);
  });
});
