import { describe, expect, it } from "vitest";
import { computeReadinessChecks, type PackageCandidate } from "@/lib/packages/service";

function findCheck(checks: ReturnType<typeof computeReadinessChecks>, key: string) {
  return checks.find((c) => c.key === key);
}

function baseCandidate(overrides: Partial<PackageCandidate> = {}): PackageCandidate {
  const passingEvaluation = { overall_status: "pass" } as PackageCandidate["articleEvaluation"];
  const articleVersion = { id: "article-v1", source_set_version_id: "ss1" } as PackageCandidate["articleVersion"];
  const articleArtifact = { current_version_id: "article-v1" } as PackageCandidate["articleArtifact"];

  const channelVersion = (id: string) => ({ id }) as PackageCandidate["channelVersions"]["linkedin"];
  const channelArtifact = (id: string) => ({ current_version_id: id }) as PackageCandidate["channelArtifacts"]["linkedin"];

  return {
    request: { selected_article_version_id: "article-v1", current_source_set_id: "ss1" } as PackageCandidate["request"],
    articleArtifact,
    articleVersion,
    articleEvaluation: passingEvaluation,
    channelArtifacts: {
      linkedin: channelArtifact("li-v1"),
      x: channelArtifact("x-v1"),
      newsletter: channelArtifact("nl-v1"),
    },
    channelVersions: {
      linkedin: channelVersion("li-v1"),
      x: channelVersion("x-v1"),
      newsletter: channelVersion("nl-v1"),
    },
    channelEvaluations: {
      linkedin: passingEvaluation,
      x: passingEvaluation,
      newsletter: passingEvaluation,
    },
    unresolvedConflictCount: 0,
    ...overrides,
  };
}

describe("computeReadinessChecks", () => {
  it("is fully ready when every condition holds", () => {
    const checks = computeReadinessChecks(baseCandidate());
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("fails article_selected when no article was selected", () => {
    const checks = computeReadinessChecks(
      baseCandidate({ request: { selected_article_version_id: null, current_source_set_id: "ss1" } as PackageCandidate["request"], articleVersion: null })
    );
    expect(findCheck(checks, "article_selected")?.ok).toBe(false);
  });

  it("fails article_is_current when the selected version has been superseded", () => {
    const checks = computeReadinessChecks(
      baseCandidate({ articleArtifact: { current_version_id: "article-v2" } as PackageCandidate["articleArtifact"] })
    );
    expect(findCheck(checks, "article_is_current")?.ok).toBe(false);
  });

  it("fails article_evaluation_passing when the article's evaluation is not passing", () => {
    const checks = computeReadinessChecks(
      baseCandidate({ articleEvaluation: { overall_status: "revise" } as PackageCandidate["articleEvaluation"] })
    );
    expect(findCheck(checks, "article_evaluation_passing")?.ok).toBe(false);
  });

  it("fails a channel's current_version check when it has no generated version", () => {
    const checks = computeReadinessChecks(
      baseCandidate({ channelVersions: { linkedin: null, x: { id: "x-v1" } as never, newsletter: { id: "nl-v1" } as never } })
    );
    expect(findCheck(checks, "linkedin_current_version")?.ok).toBe(false);
  });

  it("fails a channel's evaluation_passing check when its evaluation is not passing", () => {
    const checks = computeReadinessChecks(
      baseCandidate({
        channelEvaluations: {
          linkedin: { overall_status: "pass" } as never,
          x: { overall_status: "reject" } as never,
          newsletter: { overall_status: "pass" } as never,
        },
      })
    );
    expect(findCheck(checks, "x_evaluation_passing")?.ok).toBe(false);
  });

  it("fails source_set_current when the article's source set is no longer the confirmed one", () => {
    const checks = computeReadinessChecks(
      baseCandidate({ request: { selected_article_version_id: "article-v1", current_source_set_id: "ss2" } as PackageCandidate["request"] })
    );
    expect(findCheck(checks, "source_set_current")?.ok).toBe(false);
  });

  it("fails no_unresolved_conflicts when a conflict is unresolved", () => {
    const checks = computeReadinessChecks(baseCandidate({ unresolvedConflictCount: 1 }));
    expect(findCheck(checks, "no_unresolved_conflicts")?.ok).toBe(false);
  });
});
