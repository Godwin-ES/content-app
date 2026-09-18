import { describe, it, expect } from "vitest";
import { isBlockedResearchDomain } from "@/lib/research/blocked-domains";

describe("isBlockedResearchDomain", () => {
  it("blocks the sites whose substance sits behind a sign-in", () => {
    for (const url of [
      "https://www.linkedin.com/pulse/ai-agents-recruiting",
      "https://reddit.com/r/recruiting/comments/abc",
      "https://x.com/someone/status/1",
      "https://medium.com/@writer/post",
    ]) {
      expect(isBlockedResearchDomain(url), url).toBe(true);
    }
  });

  it("blocks subdomains too", () => {
    expect(isBlockedResearchDomain("https://old.reddit.com/r/x")).toBe(true);
    expect(isBlockedResearchDomain("https://uk.linkedin.com/jobs")).toBe(true);
  });

  it("does not block a lookalike host", () => {
    // Matching on "contains" would take notlinkedin.com with it.
    expect(isBlockedResearchDomain("https://notlinkedin.com/article")).toBe(false);
    expect(isBlockedResearchDomain("https://linkedin.com.example.org/page")).toBe(false);
  });

  it("leaves ordinary sources alone", () => {
    expect(isBlockedResearchDomain("https://eightfold.ai/blog/ai-agents-recruiting")).toBe(false);
    expect(isBlockedResearchDomain("https://www.shrm.org/labs/resources/ai")).toBe(false);
  });

  it("treats an unparseable url as not blocked, leaving it to retrieval to fail honestly", () => {
    expect(isBlockedResearchDomain("not a url")).toBe(false);
  });
});
