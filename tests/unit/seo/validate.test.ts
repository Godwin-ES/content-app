import { describe, expect, it } from "vitest";
import { validateArticleSEO } from "@/lib/seo/validate";

function baseArticle(overrides: Partial<Parameters<typeof validateArticleSEO>[0]> = {}) {
  return {
    title: "AI Agents in Recruiting",
    primaryKeyword: "AI agents",
    bodyMarkdown:
      "# AI Agents in Recruiting\n\nAI agents are changing recruiting workflows for HR teams everywhere in this modern era of hiring and talent acquisition practices today. " +
      "\n\n## Why it matters\n\nSome teams reported reduced workload.\n\n## Conclusion\n\nThis is the end.",
    links: ["https://a.com", "https://b.com"],
    ...overrides,
  };
}

function findCheck(checks: ReturnType<typeof validateArticleSEO>, key: string) {
  return checks.find((c) => c.key === key);
}

describe("validateArticleSEO", () => {
  it("passes a well-formed article", () => {
    const checks = validateArticleSEO(baseArticle());
    expect(findCheck(checks, "single_h1")?.ok).toBe(true);
    expect(findCheck(checks, "keyword_in_title")?.ok).toBe(true);
    expect(findCheck(checks, "keyword_in_first_100_words")?.ok).toBe(true);
    expect(findCheck(checks, "has_h2")?.ok).toBe(true);
  });

  it("fails single_h1 when there is no H1", () => {
    const checks = validateArticleSEO(baseArticle({ bodyMarkdown: "## Section\n\ntext" }));
    expect(findCheck(checks, "single_h1")?.ok).toBe(false);
  });

  it("fails single_h1 when there are multiple H1s", () => {
    const checks = validateArticleSEO(baseArticle({ bodyMarkdown: "# One\n\ntext\n\n# Two\n\nmore text" }));
    expect(findCheck(checks, "single_h1")?.ok).toBe(false);
  });

  it("fails keyword_in_title when the primary keyword is missing from the title", () => {
    const checks = validateArticleSEO(baseArticle({ title: "Something Else Entirely", primaryKeyword: "AI agents" }));
    expect(findCheck(checks, "keyword_in_title")?.ok).toBe(false);
  });

  it("fails keyword_in_first_100_words when the keyword appears only later", () => {
    const filler = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const checks = validateArticleSEO(
      baseArticle({ bodyMarkdown: `# Title\n\n${filler} AI agents mentioned late.` })
    );
    expect(findCheck(checks, "keyword_in_first_100_words")?.ok).toBe(false);
  });

  it("fails has_h2 when there are no H2 headers", () => {
    const checks = validateArticleSEO(baseArticle({ bodyMarkdown: "# Title\n\nJust one paragraph, no sections." }));
    expect(findCheck(checks, "has_h2")?.ok).toBe(false);
  });

  it("is case-insensitive when matching the primary keyword", () => {
    const checks = validateArticleSEO(baseArticle({ title: "ai AGENTS in Recruiting", primaryKeyword: "AI Agents" }));
    expect(findCheck(checks, "keyword_in_title")?.ok).toBe(true);
  });
});

describe("keyword_in_title punctuation tolerance", () => {
  const article = (title: string, primaryKeyword: string) => ({
    title,
    primaryKeyword,
    bodyMarkdown: `# ${title}\n\n${primaryKeyword} matters.\n\n## Section\n\nBody.`,
    links: [],
  });

  const titleCheck = (title: string, keyword: string) =>
    validateArticleSEO(article(title, keyword)).find((c) => c.key === "keyword_in_title")!.ok;

  it("matches across hyphen and casing differences", () => {
    expect(titleCheck("Four Day Work Week: What The Trials Show", "four-day work week")).toBe(true);
    expect(titleCheck("AI Agents in Recruiting: What Changes", "AI agents in recruiting")).toBe(true);
  });

  it("still fails when the keyword phrase is broken up", () => {
    // The SEO spec asks for the keyword in the title, not merely its words
    // scattered through a rephrasing of it.
    expect(titleCheck("AI Agents Are Transforming Recruiting", "ai agents in recruiting")).toBe(false);
  });
});
