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
import { generateArticleOptions, regenerateArticleOption } from "@/lib/articles/service";
import { listContentArtifacts, listArtifactVersions } from "@/lib/repositories/content";

function validArticle(title = "Article") {
  return {
    insufficientEvidence: false,
    insufficientEvidenceReason: null,
    title,
    metaDescription: "meta",
    primaryKeyword: "ai agents in recruiting",
    secondaryKeywords: [],
    sections: [{ heading: "Overview", level: "h2" as const, bodyMarkdown: "Some teams reported reduced workload." }],
    links: [],
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
}

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("article generation (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "articles-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  async function requestWithPlanAndSourceSet() {
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

    const { data: plan } = await admin
      .from("content_plans")
      .insert({
        request_id: request!.id,
        source_set_version_id: sourceSet!.id,
        version_number: 1,
        primary_keyword: "ai agents in recruiting",
        title: "AI Agents in Recruiting",
        sections: [{ heading: "Intro", level: "h2", purpose: "intro", hasFactualClaims: true, evidenceIds: ["S1:E1"] }],
      })
      .select()
      .single();
    await admin.from("content_requests").update({ current_plan_id: plan!.id }).eq("id", request!.id);

    const { data: refreshed } = await admin.from("content_requests").select().eq("id", request!.id).single();
    return refreshed!;
  }

  it("generates exactly three article options (A/B/C)", async () => {
    const request = await requestWithPlanAndSourceSet();
    const ai = new FakeAIProvider([validArticle("Practical"), validArticle("Strategic"), validArticle("Educational")]);

    const result = await generateArticleOptions(owner.client, ai, "fake-model", request.id);
    expect(result.filter((r) => r.status === "succeeded")).toHaveLength(3);

    const artifacts = await listContentArtifacts(owner.client, request.id);
    const articleArtifacts = artifacts.filter((a) => a.kind === "article");
    expect(articleArtifacts.map((a) => a.slot).sort()).toEqual(["A", "B", "C"]);
  });

  it("preserves the two successful options when the third fails, and the failed one is retryable", async () => {
    const request = await requestWithPlanAndSourceSet();
    // The three slots run concurrently, so queue order does not map
    // predictably to slot order — assert on the outcome *set*, not on
    // which specific slot got which queued response.
    const ai = new FakeAIProvider([validArticle("A"), { title: "broken" }, validArticle("C")]);

    const result = await generateArticleOptions(owner.client, ai, "fake-model", request.id);
    const succeeded = result.filter((r) => r.status === "succeeded");
    const failed = result.filter((r) => r.status === "failed");
    expect(succeeded).toHaveLength(2);
    expect(failed).toHaveLength(1);

    const artifacts = await listContentArtifacts(owner.client, request.id);
    const failedSlot = artifacts.find((a) => a.kind === "article" && a.slot === failed[0].slot)!;
    expect(failedSlot.current_version_id).toBeNull();
    for (const r of succeeded) {
      const artifact = artifacts.find((a) => a.kind === "article" && a.slot === r.slot)!;
      expect(artifact.current_version_id).not.toBeNull();
    }

    ai.enqueue(validArticle("retried"));
    const retried = await regenerateArticleOption(owner.client, ai, "fake-model", failedSlot.id);
    expect(retried.status).toBe("succeeded");

    const versions = await listArtifactVersions(owner.client, failedSlot.id);
    expect(versions).toHaveLength(1);
  });

  it("rejects an article whose claims cite unknown evidence, without creating a version", async () => {
    const request = await requestWithPlanAndSourceSet();
    const badArticle = { ...validArticle("Bad"), claims: [{ ...validArticle().claims[0], evidenceIds: ["S9:E9"] }] };
    const ai = new FakeAIProvider([badArticle, validArticle("B"), validArticle("C")]);

    const result = await generateArticleOptions(owner.client, ai, "fake-model", request.id);
    const failed = result.filter((r) => r.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toMatch(/unknown evidence/i);

    const artifacts = await listContentArtifacts(owner.client, request.id);
    const failedSlot = artifacts.find((a) => a.kind === "article" && a.slot === failed[0].slot)!;
    expect(failedSlot.current_version_id).toBeNull();
  });

  it("does not start a duplicate generation run for the same option while one is already running", async () => {
    const request = await requestWithPlanAndSourceSet();
    const ai = new FakeAIProvider([validArticle("A"), validArticle("B"), validArticle("C")]);

    const [first, second] = await Promise.all([
      generateArticleOptions(owner.client, ai, "fake-model", request.id),
      generateArticleOptions(owner.client, ai, "fake-model", request.id),
    ]);

    const artifacts = await listContentArtifacts(owner.client, request.id);
    const articleArtifacts = artifacts.filter((a) => a.kind === "article");
    expect(articleArtifacts).toHaveLength(3);
    for (const artifact of articleArtifacts) {
      const versions = await listArtifactVersions(owner.client, artifact.id);
      expect(versions.length).toBeLessThanOrEqual(1);
    }
    void first;
    void second;
  });
});
