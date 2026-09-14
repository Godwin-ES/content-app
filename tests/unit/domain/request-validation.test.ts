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

  it("rejects an invalid source URL", () => {
    expect(() =>
      contentRequestInputSchema.parse({ topic: "AI agents", sourceUrls: ["not-a-url"] })
    ).toThrow();
  });

  it("accepts valid source URLs", () => {
    const result = contentRequestInputSchema.parse({
      topic: "AI agents",
      sourceUrls: ["https://example.com/article"],
    });
    expect(result.sourceUrls).toEqual(["https://example.com/article"]);
  });

  it("rejects more than 10 source URLs", () => {
    const urls = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`);
    expect(() => contentRequestInputSchema.parse({ topic: "AI agents", sourceUrls: urls })).toThrow();
  });

  it("rejects additional instructions over 8000 characters", () => {
    const tooLong = "a".repeat(8001);
    expect(() =>
      contentRequestInputSchema.parse({ topic: "AI agents", additionalInstructions: tooLong })
    ).toThrow();
  });

  it("accepts additional instructions at the 8000 character limit", () => {
    const atLimit = "a".repeat(8000);
    const result = contentRequestInputSchema.parse({
      topic: "AI agents",
      additionalInstructions: atLimit,
    });
    expect(result.additionalInstructions).toHaveLength(8000);
  });

  it("rejects an empty CTA string as distinct from omitted CTA", () => {
    expect(() => contentRequestInputSchema.parse({ topic: "AI agents", cta: "" })).toThrow();
  });
});
