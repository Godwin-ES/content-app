import { describe, expect, it } from "vitest";
import { canonicalizeUrl, dedupeByCanonicalUrl } from "@/lib/research/url";

describe("canonicalizeUrl", () => {
  it("removes common tracking parameters", () => {
    const result = canonicalizeUrl("https://example.com/article?utm_source=twitter&utm_medium=social&id=42");
    expect(result).not.toContain("utm_source");
    expect(result).not.toContain("utm_medium");
    expect(result).toContain("id=42");
  });

  it("removes fbclid, gclid, and msclkid", () => {
    const result = canonicalizeUrl("https://example.com/article?fbclid=abc&gclid=def&msclkid=ghi");
    expect(result).toBe("https://example.com/article");
  });

  it("normalizes a trailing slash on non-root paths", () => {
    const withSlash = canonicalizeUrl("https://example.com/article/");
    const withoutSlash = canonicalizeUrl("https://example.com/article");
    expect(withSlash).toBe(withoutSlash);
  });

  it("preserves the root path slash", () => {
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("lowercases the hostname", () => {
    expect(canonicalizeUrl("https://Example.COM/Article")).toContain("example.com");
  });

  it("removes the URL fragment", () => {
    expect(canonicalizeUrl("https://example.com/article#section-2")).not.toContain("#");
  });

  it("preserves meaningful query parameters", () => {
    const result = canonicalizeUrl("https://example.com/search?q=ai+agents&page=2");
    expect(result).toContain("q=ai");
    expect(result).toContain("page=2");
  });

  it("produces identical output regardless of query parameter order", () => {
    const a = canonicalizeUrl("https://example.com/article?b=2&a=1");
    const b = canonicalizeUrl("https://example.com/article?a=1&b=2");
    expect(a).toBe(b);
  });

  it("collapses tracking-parameter variants of the same article into one canonical URL", () => {
    const a = canonicalizeUrl("https://example.com/article?utm_source=x");
    const b = canonicalizeUrl("https://example.com/article?utm_source=y&utm_campaign=z");
    expect(a).toBe(b);
  });
});

describe("dedupeByCanonicalUrl", () => {
  it("keeps only the first item for each canonical URL", () => {
    const items = [
      { canonicalUrl: "https://example.com/a", label: "first" },
      { canonicalUrl: "https://example.com/a", label: "duplicate" },
      { canonicalUrl: "https://example.com/b", label: "different" },
    ];
    const result = dedupeByCanonicalUrl(items);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.label)).toEqual(["first", "different"]);
  });
});
