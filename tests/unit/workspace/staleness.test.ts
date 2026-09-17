import { describe, expect, it } from "vitest";
import { articlesStaleAgainstPlan, channelsStaleAgainstArticle } from "@/lib/workspace/staleness";

type Version = Parameters<typeof articlesStaleAgainstPlan>[0][number];

const version = (overrides: Partial<NonNullable<Version>>) =>
  ({ content_plan_id: null, base_article_version_id: null, ...overrides }) as NonNullable<Version>;

describe("articlesStaleAgainstPlan", () => {
  it("says nothing while the articles match the current plan", () => {
    expect(articlesStaleAgainstPlan([version({ content_plan_id: "plan-1" })], "plan-1")).toBeNull();
  });

  it("flags articles written against a superseded plan", () => {
    const notice = articlesStaleAgainstPlan(
      [version({ content_plan_id: "plan-1" }), version({ content_plan_id: "plan-1" })],
      "plan-2"
    );
    expect(notice?.reason).toContain("content plan has changed");
    expect(notice?.action).toContain("Regenerate");
  });

  it("counts how many options are affected when only some are", () => {
    const notice = articlesStaleAgainstPlan(
      [version({ content_plan_id: "plan-1" }), version({ content_plan_id: "plan-2" })],
      "plan-2"
    );
    expect(notice?.reason).toContain("1 of these 2");
  });

  it("stays quiet when there is nothing to compare against", () => {
    expect(articlesStaleAgainstPlan([], "plan-1")).toBeNull();
    expect(articlesStaleAgainstPlan([null], "plan-1")).toBeNull();
    expect(articlesStaleAgainstPlan([version({ content_plan_id: "plan-1" })], null)).toBeNull();
    // Written before the provenance column existed: unknown, not stale.
    expect(articlesStaleAgainstPlan([version({ content_plan_id: null })], "plan-1")).toBeNull();
  });
});

describe("channelsStaleAgainstArticle", () => {
  it("flags channels adapted from an article that is no longer the selected one", () => {
    const notice = channelsStaleAgainstArticle(
      [version({ base_article_version_id: "article-a" }), version({ base_article_version_id: "article-a" })],
      "article-b"
    );
    expect(notice?.reason).toContain("selected article has changed");
  });

  it("says nothing while the channels match the selected article", () => {
    expect(channelsStaleAgainstArticle([version({ base_article_version_id: "article-a" })], "article-a")).toBeNull();
  });
});
