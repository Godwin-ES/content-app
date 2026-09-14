// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FakeResearchProvider } from "@/lib/research/providers/fake";
import { FirecrawlResearchProvider } from "@/lib/research/providers/firecrawl";

describe("FakeResearchProvider", () => {
  it("returns registered search results for a query", async () => {
    const provider = new FakeResearchProvider();
    provider.setSearchResults("ai agents", [{ url: "https://example.com/a", title: "A", snippet: "s" }]);
    const results = await provider.search("ai agents", 5);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://example.com/a");
  });

  it("returns an empty array for an unregistered query rather than throwing", async () => {
    const provider = new FakeResearchProvider();
    const results = await provider.search("nothing registered", 5);
    expect(results).toEqual([]);
  });

  it("returns a failed outcome for an unregistered URL", async () => {
    const provider = new FakeResearchProvider();
    const outcome = await provider.retrieve("https://example.com/unregistered");
    expect(outcome.status).toBe("failed");
  });

  it("returns the exact registered retrieval outcome for a URL", async () => {
    const provider = new FakeResearchProvider();
    provider.setRetrieval("https://example.com/a", {
      status: "usable",
      page: {
        originalUrl: "https://example.com/a",
        canonicalUrl: "https://example.com/a",
        title: "A",
        publisher: "Example",
        author: null,
        publishedAt: null,
        markdown: "Some content.",
        retrievedAt: new Date().toISOString(),
      },
    });
    const outcome = await provider.retrieve("https://example.com/a");
    expect(outcome.status).toBe("usable");
  });
});

const hasFirecrawlKey = Boolean(process.env.FIRECRAWL_API_KEY);

describe.skipIf(!hasFirecrawlKey)("FirecrawlResearchProvider (live contract check)", () => {
  it("returns candidate search results, not evidence, for a real query", async () => {
    const provider = new FirecrawlResearchProvider();
    const results = await provider.search("site:example.com", 3);
    expect(Array.isArray(results)).toBe(true);
  }, 30000);

  it("classifies a real, substantive page as usable with normalized metadata", async () => {
    const provider = new FirecrawlResearchProvider();
    const outcome = await provider.retrieve("https://en.wikipedia.org/wiki/Artificial_intelligence");
    expect(outcome.status).toBe("usable");
    if (outcome.status === "usable") {
      expect(outcome.page.markdown.length).toBeGreaterThan(200);
      expect(outcome.page.canonicalUrl).toContain("wikipedia.org");
    }
  }, 30000);

  it("classifies a nonexistent page as failed rather than usable", async () => {
    const provider = new FirecrawlResearchProvider();
    const outcome = await provider.retrieve("https://example.com/this-definitely-does-not-exist-12345");
    expect(outcome.status).toBe("failed");
  }, 30000);
});
