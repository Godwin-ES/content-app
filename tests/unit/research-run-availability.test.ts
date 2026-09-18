import { describe, it, expect } from "vitest";
import { researchRunAvailability } from "@/lib/research/service";

const base = {
  status: "source_review",
  resolved_primary_keyword: "ai recruiting agents",
  researched_keyword: "ai recruiting agents",
  deleted_at: null as string | null,
};

describe("researchRunAvailability", () => {
  it("offers the first run on a draft", () => {
    expect(researchRunAvailability({ ...base, status: "draft", researched_keyword: null })).toEqual({
      canRun: true,
      kind: "initial",
    });
  });

  it("offers a re-run once the keyword has changed", () => {
    const result = researchRunAvailability({ ...base, resolved_primary_keyword: "autonomous hiring agents" });
    expect(result).toEqual({ canRun: true, kind: "rerun" });
  });

  it("refuses a re-run for the same keyword — the same searches find the same pages", () => {
    const result = researchRunAvailability(base);
    expect(result.canRun).toBe(false);
    expect(result.canRun === false && result.reason).toContain("Change the primary keyword");
  });

  it("treats a re-spelling as the same keyword rather than a change", () => {
    // "Four Day Work Week" and "four-day work week" would search for the
    // same thing; offering a re-run for that spends a pipeline on nothing.
    expect(
      researchRunAvailability({
        ...base,
        researched_keyword: "four-day work week",
        resolved_primary_keyword: "Four Day Work Week",
      }).canRun
    ).toBe(false);
  });

  it("stops offering research once the source set is confirmed", () => {
    const result = researchRunAvailability({
      ...base,
      status: "content_development",
      resolved_primary_keyword: "something else entirely",
    });
    expect(result.canRun).toBe(false);
    expect(result.canRun === false && result.reason).toContain("confirmed");
  });

  it("refuses for a binned request", () => {
    const result = researchRunAvailability({ ...base, status: "draft", deleted_at: new Date().toISOString() });
    expect(result.canRun).toBe(false);
    expect(result.canRun === false && result.reason).toContain("bin");
  });
});
