// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  hasSupabaseCredentials,
} from "@/tests/helpers/supabase-test-clients";
import { FakeAIProvider } from "@/lib/ai/providers/fake";
import { evaluateArticleVersion } from "@/lib/articles/service";

const VALID_ARTICLE = {
  insufficientEvidence: false,
  insufficientEvidenceReason: null,
  title: "AI Agents in Recruiting",
  metaDescription: "meta",
  primaryKeyword: "AI agents in recruiting",
  secondaryKeywords: [],
  bodyMarkdown: "# AI Agents in Recruiting\n\nSome teams reported reduced workload.\n\n## Details\n\nMore text here about it.",
  links: [{ url: "https://a.com", label: "Source" }],
  claims: [
    {
      claimId: "C1",
      claimType: "factual" as const,
      claimText: "Some teams reported reduced workload.",
      evidenceIds: ["S1:E1"],
      articleSection: "Introduction",
    },
  ],
};

function passingEvaluation() {
  return {
    overallStatus: "pass" as const,
    criteria: [
      { criterion: "topic_relevance" as const, score: 5, finding: "ok", location: null, recommendedAction: null },
      { criterion: "source_grounding" as const, score: 5, finding: "ok", location: null, recommendedAction: null },
      { criterion: "factual_consistency" as const, score: 5, finding: "ok", location: null, recommendedAction: null },
    ],
    claimAudit: [{ claimId: "C1", status: "supported" as const, note: null }],
    unsupportedClaims: [],
    sectionsNeedingRevision: [],
    revisionInstructions: null,
  };
}

function inconsistentEvaluation() {
  return { ...passingEvaluation(), claimAudit: [{ claimId: "C1", status: "unsupported" as const, note: "no evidence" }] };
}

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("article evaluation (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "evaluation-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  async function requestWithArticleVersion() {
    const { data: request } = await admin
      .from("content_requests")
      .insert({
        owner_id: owner.userId,
        topic: "AI agents in recruiting",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate",
        resolved_tone: "Professional",
        status: "content_development",
      })
      .select()
      .single();
    requestIds.push(request!.id);

    const { data: source } = await admin
      .from("research_sources")
      .insert({ request_id: request!.id, origin: "researched", original_url: "https://example.com/a", retrieval_status: "usable" })
      .select()
      .single();
    const { data: sourceSet } = await admin
      .from("source_set_versions")
      .insert({ request_id: request!.id, version_number: 1, confirmed_by: owner.userId })
      .select()
      .single();
    await admin.from("source_set_items").insert({ source_set_version_id: sourceSet!.id, source_id: source!.id });
    await admin.from("content_requests").update({ current_source_set_id: sourceSet!.id }).eq("id", request!.id);
    await admin.from("source_evidence").insert({
      source_id: source!.id,
      evidence_key: "E1",
      excerpt: "Some teams reported reduced workload.",
      conservative_summary: "Some teams reported reduced workload.",
      supports: ["automation reduces workload"],
      limitations: [],
    });

    const { data: artifact } = await admin
      .from("content_artifacts")
      .insert({ request_id: request!.id, kind: "article", slot: "A" })
      .select()
      .single();
    const { data: version } = await owner.client.rpc("create_artifact_version", {
      p_artifact_id: artifact!.id,
      p_change_type: "initial_generation",
      p_content: VALID_ARTICLE,
      p_content_hash: "hash1",
      p_source_set_version_id: sourceSet!.id,
    });

    return { requestId: request!.id, versionId: (version as { id: string }).id };
  }

  it("computes deterministic SEO checks and persists a passing evaluation", async () => {
    const { versionId } = await requestWithArticleVersion();
    const ai = new FakeAIProvider([passingEvaluation()]);

    const evaluation = await evaluateArticleVersion(owner.client, ai, "fake-model", versionId);

    expect(evaluation.overall_status).toBe("pass");
    const checks = evaluation.deterministic_checks as Array<{ key: string; ok: boolean }>;
    expect(checks.find((c) => c.key === "single_h1")?.ok).toBe(true);
    expect(checks.find((c) => c.key === "keyword_in_title")?.ok).toBe(true);
  });

  it("retries once on an internally inconsistent evaluation, then surfaces failure while preserving the article", async () => {
    const { versionId } = await requestWithArticleVersion();
    // Both attempts are inconsistent (pass + unsupported claim audit).
    const ai = new FakeAIProvider([inconsistentEvaluation(), inconsistentEvaluation()]);

    await expect(evaluateArticleVersion(owner.client, ai, "fake-model", versionId)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    const { data: version } = await admin.from("artifact_versions").select().eq("id", versionId).single();
    expect(version).not.toBeNull();
    expect(version?.content).toMatchObject({ title: "AI Agents in Recruiting" });

    const { data: evaluations } = await admin.from("evaluations").select().eq("artifact_version_id", versionId);
    expect(evaluations).toHaveLength(0);
  });

  it("succeeds on the second attempt when only the first evaluation is inconsistent", async () => {
    const { versionId } = await requestWithArticleVersion();
    const ai = new FakeAIProvider([inconsistentEvaluation(), passingEvaluation()]);

    const evaluation = await evaluateArticleVersion(owner.client, ai, "fake-model", versionId);
    expect(evaluation.overall_status).toBe("pass");
  });
});
