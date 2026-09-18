import { describe, expect, it } from "vitest";
import { AI_MUSIC_SUBMISSION_PACK } from "@/lib/sample-pack/submission-snapshot";

describe("public submission sample pack", () => {
  it("contains the exact deliverables required for the Week 4 sample pack without account identity", () => {
    const pack = AI_MUSIC_SUBMISSION_PACK;
    const serialized = JSON.stringify(pack);

    expect(pack.topic).toBe("Impact of AI in music industry");
    expect(pack.reviewedSources).toHaveLength(8);
    expect(pack.reviewedSources.every((source) => Boolean(source.url))).toBe(true);
    expect(pack.article.title).toBeTruthy();
    expect(pack.article.sections.length).toBeGreaterThan(0);
    expect(pack.linkedin.body).toBeTruthy();
    expect(pack.x.body).toBeTruthy();
    expect(pack.newsletter.subject).toBeTruthy();
    expect(pack.newsletter.bodyMarkdown).toBeTruthy();

    expect(serialized).not.toContain("Charles Morris");
    expect(serialized).not.toContain("47ea1c35-c449-4e9a-91fe-6f321efff04e");
    expect(serialized).not.toContain("bc52b860-88db-42a1-880a-9d3334bdae38");
  });
});
