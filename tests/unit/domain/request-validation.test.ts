import { describe, expect, it } from "vitest";
import { contentRequestInputSchema } from "@/lib/domain/schemas";

describe("contentRequestInputSchema", () => {
  it("accepts a topic-only request", () => {
    const result = contentRequestInputSchema.parse({ topic: "AI agents in recruiting" });
    expect(result.topic).toBe("AI agents in recruiting");
  });

  it("rejects a blank topic", () => {
    expect(() => contentRequestInputSchema.parse({ topic: "" })).toThrow();
  });

  it("rejects a whitespace-only topic", () => {
    expect(() => contentRequestInputSchema.parse({ topic: "   " })).toThrow();
  });

  it("trims the topic", () => {
    const result = contentRequestInputSchema.parse({ topic: "  AI agents  " });
    expect(result.topic).toBe("AI agents");
  });

  it("ignores a supplied-URL list, which is no longer a property of the request", () => {
    // Supplied URLs became research_sources rows with origin 'user_url' at
    // intake. An old caller passing them here must not have them silently
    // accepted into a column that no longer exists.
    const result = contentRequestInputSchema.parse({ topic: "AI agents", sourceUrls: ["https://example.com/a"] });
    expect(result).not.toHaveProperty("sourceUrls");
  });

  it("rejects an empty CTA string as distinct from omitted CTA", () => {
    expect(() => contentRequestInputSchema.parse({ topic: "AI agents", cta: "" })).toThrow();
  });
});
