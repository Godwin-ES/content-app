import { describe, expect, it } from "vitest";
import { deriveNextAction, type WorkspaceSnapshot } from "@/lib/workspace/next-action";

function base(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    status: "draft",
    sources: { usable: 0, pending: 0, failed: 0, unusable: 0 },
    hasContentPlan: false,
    articles: { total: 0, anyGenerationFailed: false, anyPassingEvaluation: false, anyNeedsRevisionOrUnevaluated: false },
    hasSelectedArticle: false,
    channels: { total: 0, anyMissing: false, anyNotPassing: false },
    packageReady: false,
    hasCurrentPackage: false,
    hasActiveQueueItems: false,
    ...overrides,
  };
}

describe("deriveNextAction", () => {
  it("asks to add sources for a draft request", () => {
    expect(deriveNextAction(base({ status: "draft" })).key).toBe("add_sources");
  });

  it("shows research in progress while sources are still pending", () => {
    const result = deriveNextAction(base({ status: "source_review", sources: { usable: 0, pending: 2, failed: 0, unusable: 0 } }));
    expect(result.key).toBe("wait_for_research");
  });

  it("flags no usable sources once retrieval has finished with nothing usable", () => {
    const result = deriveNextAction(base({ status: "source_review", sources: { usable: 0, pending: 0, failed: 3, unusable: 1 } }));
    expect(result.key).toBe("resolve_no_usable_sources");
  });

  it("asks to review sources once usable sources exist and nothing is pending", () => {
    const result = deriveNextAction(base({ status: "source_review", sources: { usable: 3, pending: 0, failed: 0, unusable: 0 } }));
    expect(result.key).toBe("review_sources");
  });

  it("asks to generate a content plan first in content_development", () => {
    const result = deriveNextAction(base({ status: "content_development", hasContentPlan: false }));
    expect(result.key).toBe("generate_content_plan");
  });

  it("asks to generate articles once a plan exists but no options do", () => {
    const result = deriveNextAction(base({ status: "content_development", hasContentPlan: true }));
    expect(result.key).toBe("generate_articles");
  });

  it("asks to retry a failed article option", () => {
    const result = deriveNextAction(
      base({
        status: "content_development",
        hasContentPlan: true,
        articles: { total: 3, anyGenerationFailed: true, anyPassingEvaluation: false, anyNeedsRevisionOrUnevaluated: false },
      })
    );
    expect(result.key).toBe("resolve_article_generation_failure");
  });

  it("asks to select an article once one has a passing evaluation", () => {
    const result = deriveNextAction(
      base({
        status: "content_development",
        hasContentPlan: true,
        articles: { total: 3, anyGenerationFailed: false, anyPassingEvaluation: true, anyNeedsRevisionOrUnevaluated: false },
      })
    );
    expect(result.key).toBe("select_article");
  });

  it("asks to resolve evaluation when no article option passes yet", () => {
    const result = deriveNextAction(
      base({
        status: "content_development",
        hasContentPlan: true,
        articles: { total: 3, anyGenerationFailed: false, anyPassingEvaluation: false, anyNeedsRevisionOrUnevaluated: true },
      })
    );
    expect(result.key).toBe("resolve_article_evaluation");
  });

  it("asks to generate channels once an article is selected", () => {
    const result = deriveNextAction(
      base({
        status: "content_development",
        hasContentPlan: true,
        articles: { total: 3, anyGenerationFailed: false, anyPassingEvaluation: true, anyNeedsRevisionOrUnevaluated: false },
        hasSelectedArticle: true,
      })
    );
    expect(result.key).toBe("generate_channels");
  });

  const readyArticles = { total: 3, anyGenerationFailed: false, anyPassingEvaluation: true, anyNeedsRevisionOrUnevaluated: false };

  it("asks to resolve a channel issue when a channel is missing or failing", () => {
    const result = deriveNextAction(
      base({
        status: "content_development",
        hasContentPlan: true,
        articles: readyArticles,
        hasSelectedArticle: true,
        channels: { total: 3, anyMissing: false, anyNotPassing: true },
      })
    );
    expect(result.key).toBe("resolve_channel_issue");
  });

  it("asks to create a package once everything is ready", () => {
    const result = deriveNextAction(
      base({
        status: "content_development",
        hasContentPlan: true,
        articles: readyArticles,
        hasSelectedArticle: true,
        channels: { total: 3, anyMissing: false, anyNotPassing: false },
        packageReady: true,
      })
    );
    expect(result.key).toBe("create_package");
  });

  it("asks to submit for approval once a package exists", () => {
    const result = deriveNextAction(
      base({
        status: "content_development",
        hasContentPlan: true,
        articles: readyArticles,
        hasSelectedArticle: true,
        channels: { total: 3, anyMissing: false, anyNotPassing: false },
        hasCurrentPackage: true,
      })
    );
    expect(result.key).toBe("submit_for_approval");
  });

  it("shows awaiting review while pending_approval", () => {
    expect(deriveNextAction(base({ status: "pending_approval" })).key).toBe("await_review");
  });

  it("asks to review requested changes", () => {
    expect(deriveNextAction(base({ status: "changes_requested" })).key).toBe("review_requested_changes");
  });

  it("asks to queue approved content when nothing is queued yet", () => {
    expect(deriveNextAction(base({ status: "approved", hasActiveQueueItems: false })).key).toBe("queue_approved_content");
  });

  it("shows nothing pending when everything approved is already queued", () => {
    expect(deriveNextAction(base({ status: "approved", hasActiveQueueItems: true })).key).toBe("none");
  });

  it("shows nothing pending for an archived request", () => {
    expect(deriveNextAction(base({ status: "archived" })).key).toBe("none");
  });
});
