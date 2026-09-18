import { describe, it, expect } from "vitest";
import { researchRunAvailability } from "@/lib/research/service";

const base = {
  status: "source_review",
  supplied_sources_only: false,
  researched_supplied_only: false,
  deleted_at: null as string | null,
};

describe("researchRunAvailability", () => {
  it("offers the first run on a draft", () => {
    const result = researchRunAvailability({ ...base, status: "draft", researched_supplied_only: null });
    expect(result.canRun && result.kind).toBe("initial");
  });

  it("says on a draft whether the first run will search the web", () => {
    const supplied = researchRunAvailability({ ...base, status: "draft", supplied_sources_only: true });
    expect(supplied.canRun && supplied.detail).toContain("No web search");

    const open = researchRunAvailability({ ...base, status: "draft" });
    expect(open.canRun && open.detail).toContain("searches the web");
  });

  it("offers a re-run once a source has been added", () => {
    const result = researchRunAvailability(base, 2);
    expect(result.canRun && result.kind).toBe("rerun");
    expect(result.canRun && result.detail).toContain("2 sources added");
  });

  it("offers a re-run once a web search has been allowed", () => {
    // The one change that makes the same searches produce different
    // results, because previously there were none.
    const result = researchRunAvailability({ ...base, researched_supplied_only: true, supplied_sources_only: false });
    expect(result.canRun && result.kind).toBe("rerun");
    expect(result.canRun && result.detail).toContain("Web search is allowed now");
  });

  it("refuses a re-run that would repeat the same searches over the same scope", () => {
    const result = researchRunAvailability(base);
    expect(result.canRun).toBe(false);
    expect(result.canRun === false && result.hint).toBe("Add a source to find more");
  });

  it("points a supplied-only request at both ways out", () => {
    const result = researchRunAvailability({ ...base, supplied_sources_only: true, researched_supplied_only: true });
    expect(result.canRun).toBe(false);
    expect(result.canRun === false && result.hint).toBe("Add a source, or allow a web search");
  });

  it("stops offering research once the source set is confirmed", () => {
    const result = researchRunAvailability({ ...base, status: "content_development" }, 3);
    expect(result.canRun).toBe(false);
    expect(result.canRun === false && result.hint).toBe("Source set confirmed");
  });

  it("refuses for a binned request", () => {
    const result = researchRunAvailability({ ...base, status: "draft", deleted_at: new Date().toISOString() });
    expect(result.canRun).toBe(false);
    expect(result.canRun === false && result.reason).toContain("bin");
  });
});
