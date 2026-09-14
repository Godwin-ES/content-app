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
import {
  autoReviseArticle,
  saveManualArticleRevision,
  proposeTargetedRevision,
  applyTargetedRevision,
  selectArticle,
} from "@/lib/articles/service";
import { listArtifactVersions } from "@/lib/repositories/content";
import { listEvaluations } from "@/lib/repositories/evaluations";
import type { Evaluation } from "@/lib/ai/schemas/evaluation";

function article(title = "Article", extra: Record<string, unknown> = {}) {
  return {
    insufficientEvidence: false,
    insufficientEvidenceReason: null,
    title,
    metaDescription: "meta",
    primaryKeyword: "ai agents in recruiting",
    secondaryKeywords: [],
    bodyMarkdown: `# ${title}\n\nSome teams reported reduced workload.\n\n## Details\n\nMore text about it here.`,
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
    ...extra,
  };
}

function revisableEvaluation() {
  return {
    overallStatus: "revise" as const,
    criteria: [
      { criterion: "topic_relevance" as const, score: 4, finding: "ok", location: null, recommendedAction: null },
      { criterion: "source_grounding" as const, score: 4, finding: "ok", location: null, recommendedAction: null },
      { criterion: "factual_consistency" as const, score: 4, finding: "ok", location: null, recommendedAction: null },
      { criterion: "completeness" as const, score: 2, finding: "too short", location: null, recommendedAction: "expand" },
    ],
    claimAudit: [{ claimId: "C1", status: "supported" as const, note: null }],
    unsupportedClaims: [],
    sectionsNeedingRevision: ["Details"],
    revisionInstructions: "Expand the Details section.",
  };
}

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

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("article revision, selection, and targeted edits (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "revision-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  async function requestWithEvaluatedArticle(evaluation: Evaluation) {
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
      p_content: article("Draft 0"),
      p_content_hash: "hash0",
      p_source_set_version_id: sourceSet!.id,
    });
    const versionId = (version as { id: string }).id;

    await admin.from("evaluations").insert({
      artifact_version_id: versionId,
      overall_status: evaluation.overallStatus,
      deterministic_checks: [],
      criteria: evaluation.criteria,
      claim_audit: evaluation.claimAudit,
      unsupported_claims: evaluation.unsupportedClaims,
      sections_needing_revision: evaluation.sectionsNeedingRevision,
      revision_instructions: evaluation.revisionInstructions,
    });

    return { requestId: request!.id, artifactId: artifact!.id, versionId };
  }

  it("allows exactly one automatic revision after a 'revise' evaluation, then refuses a second", async () => {
    const { versionId } = await requestWithEvaluatedArticle(revisableEvaluation());
    const ai = new FakeAIProvider([article("Draft 1, expanded"), passingEvaluation()]);

    const revision1 = await autoReviseArticle(owner.client, ai, "fake-model", versionId);
    expect(revision1.versionId).not.toBe(versionId);

    // Force revision 1 to also need revision so we can attempt a second automatic pass.
    await admin
      .from("evaluations")
      .update({ overall_status: "revise" })
      .eq("artifact_version_id", revision1.versionId);

    await expect(autoReviseArticle(owner.client, ai, "fake-model", revision1.versionId)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });

  it("keeps the previous evaluation historical: it never applies to the new revision", async () => {
    const { versionId } = await requestWithEvaluatedArticle(revisableEvaluation());
    const ai = new FakeAIProvider([article("Draft 1"), passingEvaluation()]);

    const revision1 = await autoReviseArticle(owner.client, ai, "fake-model", versionId);

    const evaluationsForV0 = await listEvaluations(owner.client, versionId);
    expect(evaluationsForV0).toHaveLength(1);
    expect(evaluationsForV0[0].overall_status).toBe("revise");

    const evaluationsForV1 = await listEvaluations(owner.client, revision1.versionId);
    expect(evaluationsForV1).toHaveLength(1);
    expect(evaluationsForV1[0].overall_status).toBe("pass");
  });

  it("allows a manual edit after the automatic revision has been used", async () => {
    const { requestId, artifactId, versionId } = await requestWithEvaluatedArticle(revisableEvaluation());
    const ai = new FakeAIProvider([article("Draft 1"), passingEvaluation()]);
    const revision1 = await autoReviseArticle(owner.client, ai, "fake-model", versionId);

    const manualVersion = await saveManualArticleRevision(
      owner.client,
      artifactId,
      article("Manually corrected title"),
      owner.userId
    );
    expect(manualVersion.change_type).toBe("manual_edit");

    const versions = await listArtifactVersions(owner.client, artifactId);
    expect(versions.map((v) => v.id)).toContain(revision1.versionId);
    expect(versions.map((v) => v.id)).toContain(manualVersion.id);

    void requestId;
  });

  it("proposes a targeted revision without persisting it until explicitly applied", async () => {
    const { versionId } = await requestWithEvaluatedArticle(passingEvaluation());
    const ai = new FakeAIProvider([article("Proposed targeted edit")]);

    const proposal = await proposeTargetedRevision(owner.client, ai, "fake-model", versionId, "Details", "Make this punchier.");
    expect(proposal.title).toBe("Proposed targeted edit");

    const versionsBefore = await listArtifactVersions(owner.client, (await admin.from("artifact_versions").select("artifact_id").eq("id", versionId).single()).data!.artifact_id);
    expect(versionsBefore).toHaveLength(1);

    const applied = await applyTargetedRevision(owner.client, versionId, proposal, owner.userId);
    expect(applied.change_type).toBe("targeted_regeneration");
  });

  it("requires a passing evaluation before an article can be selected", async () => {
    const { requestId, versionId } = await requestWithEvaluatedArticle(revisableEvaluation());
    await expect(selectArticle(owner.client, requestId, versionId, owner.userId)).rejects.toMatchObject({
      code: "APPROVAL_REQUIRED",
    });
  });

  it("selects an article with a passing evaluation and records it on the request", async () => {
    const { requestId, versionId } = await requestWithEvaluatedArticle(passingEvaluation());
    await selectArticle(owner.client, requestId, versionId, owner.userId);

    const { data: request } = await admin.from("content_requests").select("selected_article_version_id").eq("id", requestId).single();
    expect(request?.selected_article_version_id).toBe(versionId);
  });
});
