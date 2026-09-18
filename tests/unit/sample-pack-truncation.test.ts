import { describe, it, expect } from "vitest";
import { CHANNEL_PREVIEW_LIMIT, needsTruncating, previewOf } from "@/components/requests/sample-pack-section";

const words = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(" ");

describe("channel preview truncation", () => {
  it("leaves a full-length LinkedIn post alone", () => {
    // The user's own example post was ~950 characters; a channel asset that
    // fits on screen should never be hidden behind a "See more".
    const post = words(140).slice(0, 950);
    expect(post.length).toBe(950);
    expect(needsTruncating(post)).toBe(false);
    expect(previewOf(post)).toBe(post);
  });

  it("truncates copy beyond the limit", () => {
    const long = words(400);
    expect(long.length).toBeGreaterThan(CHANNEL_PREVIEW_LIMIT);
    expect(needsTruncating(long)).toBe(true);

    const preview = previewOf(long);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(CHANNEL_PREVIEW_LIMIT + 1);
  });

  it("never cuts mid-word", () => {
    const long = words(400);
    const preview = previewOf(long).replace(/…$/, "");
    // Every emitted token is a whole "wordN", not a fragment of one.
    for (const token of preview.split(" ")) {
      expect(token).toMatch(/^word\d+$/);
    }
  });

  it("falls back to a hard cut when a single token runs past the limit", () => {
    // One unbroken string (a pasted URL, say) has no word boundary to find,
    // so the preview must still be bounded rather than returned whole.
    const unbroken = "x".repeat(CHANNEL_PREVIEW_LIMIT * 2);
    const preview = previewOf(unbroken);
    expect(preview).toBe(`${"x".repeat(CHANNEL_PREVIEW_LIMIT)}…`);
  });

  it("measures the trimmed text, so trailing whitespace alone never truncates", () => {
    const padded = `${"a".repeat(CHANNEL_PREVIEW_LIMIT)}\n\n   `;
    expect(needsTruncating(padded)).toBe(false);
    expect(previewOf(padded)).toBe("a".repeat(CHANNEL_PREVIEW_LIMIT));
  });
});
