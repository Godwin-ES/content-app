// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  hasSupabaseCredentials,
} from "@/tests/helpers/supabase-test-clients";
import { getPackageReadiness, createContentPackage } from "@/lib/packages/service";

function articleContent(title = "Article") {
  return {
    insufficientEvidence: false,
    insufficientEvidenceReason: null,
    title,
    metaDescription: "meta",
    primaryKeyword: "ai agents in recruiting",
    secondaryKeywords: [],
    sections: [{ heading: "Overview", level: "h2" as const, bodyMarkdown: "Some teams reported reduced workload." }],
    links: [],
    claims: [],
  };
}
function linkedinContent() {
  return { body: "A LinkedIn post.", hasCallToAction: true };
}
function xContent() {
  return { body: "An X post.", hashtags: [] };
}
function newsletterContent() {
  return {
    subject: "Subject",
    introduction: "Intro",
    bodyMarkdown: "Body",
    callToAction: "Read more",
    signoff: "Best",
  };
}

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("content packages (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "packages-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  async function baseRequest() {
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

    return { requestId: request!.id, sourceSetId: sourceSet!.id };
  }

  async function createVersion(kind: "article" | "linkedin" | "x" | "newsletter", requestId: string, sourceSetId: string, content: unknown, slot: "A" | null = null) {
    const { data: artifact } = await admin
      .from("content_artifacts")
      .insert({ request_id: requestId, kind, slot: kind === "article" ? "A" : null })
      .select()
      .single();
    const { data: version } = await owner.client.rpc("create_artifact_version", {
      p_artifact_id: artifact!.id,
      p_change_type: kind === "article" ? "initial_generation" : "channel_adaptation",
      p_content: content as Json,
      p_content_hash: `hash-${kind}-${slot ?? "1"}`,
      p_source_set_version_id: sourceSetId,
    });
    return { artifactId: artifact!.id, versionId: (version as { id: string }).id };
  }

  async function passingEvaluation(versionId: string) {
    const { data } = await admin
      .from("evaluations")
      .insert({
        artifact_version_id: versionId,
        overall_status: "pass",
        deterministic_checks: [],
        criteria: [],
        claim_audit: [],
        unsupported_claims: [],
        sections_needing_revision: [],
      })
      .select()
      .single();
    return data!;
  }

  async function fullyReadyRequest() {
    const { requestId, sourceSetId } = await baseRequest();
    const article = await createVersion("article", requestId, sourceSetId, articleContent());
    await passingEvaluation(article.versionId);
    await admin.from("content_requests").update({ selected_article_version_id: article.versionId }).eq("id", requestId);

    const linkedin = await createVersion("linkedin", requestId, sourceSetId, linkedinContent());
    await passingEvaluation(linkedin.versionId);
    const x = await createVersion("x", requestId, sourceSetId, xContent());
    await passingEvaluation(x.versionId);
    const newsletter = await createVersion("newsletter", requestId, sourceSetId, newsletterContent());
    await passingEvaluation(newsletter.versionId);

    return { requestId, sourceSetId, article, linkedin, x, newsletter };
  }

  it("reports ready when every condition holds, and creates a package", async () => {
    const { requestId } = await fullyReadyRequest();

    const readiness = await getPackageReadiness(owner.client, requestId);
    expect(readiness.ready).toBe(true);
    expect(readiness.checks.every((c) => c.ok)).toBe(true);

    const pkg = await createContentPackage(owner.client, requestId);
    expect(pkg.version_number).toBe(1);

    const { data: request } = await admin.from("content_requests").select("current_package_id").eq("id", requestId).single();
    expect(request?.current_package_id).toBe(pkg.id);
  });

  it("reports not ready and explains why when no article has been selected", async () => {
    const { requestId } = await baseRequest();
    const readiness = await getPackageReadiness(owner.client, requestId);
    expect(readiness.ready).toBe(false);
    expect(readiness.checks.find((c) => c.key === "article_selected")?.ok).toBe(false);

    await expect(createContentPackage(owner.client, requestId)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });

  it("reports not ready when a channel asset has no passing evaluation", async () => {
    const { requestId, sourceSetId } = await baseRequest();
    const article = await createVersion("article", requestId, sourceSetId, articleContent());
    await passingEvaluation(article.versionId);
    await admin.from("content_requests").update({ selected_article_version_id: article.versionId }).eq("id", requestId);

    const linkedin = await createVersion("linkedin", requestId, sourceSetId, linkedinContent());
    // Deliberately no evaluation for linkedin.
    void linkedin;
    await createVersion("x", requestId, sourceSetId, xContent()).then((v) => passingEvaluation(v.versionId));
    await createVersion("newsletter", requestId, sourceSetId, newsletterContent()).then((v) => passingEvaluation(v.versionId));

    const readiness = await getPackageReadiness(owner.client, requestId);
    expect(readiness.ready).toBe(false);
    expect(readiness.checks.find((c) => c.key === "linkedin_evaluation_passing")?.ok).toBe(false);
  });

  it("reports not ready when the selected article has been superseded by a newer revision", async () => {
    const { requestId, article, sourceSetId } = await fullyReadyRequest();

    // A manual edit creates v2 as the artifact's new current version, but
    // selected_article_version_id still points at v1.
    await owner.client.rpc("create_artifact_version", {
      p_artifact_id: (await admin.from("artifact_versions").select("artifact_id").eq("id", article.versionId).single()).data!.artifact_id,
      p_expected_current_version_id: article.versionId,
      p_change_type: "manual_edit",
      p_content: articleContent("Edited"),
      p_content_hash: "hash-article-edited",
      p_source_set_version_id: sourceSetId,
    });

    const readiness = await getPackageReadiness(owner.client, requestId);
    expect(readiness.ready).toBe(false);
    expect(readiness.checks.find((c) => c.key === "article_is_current")?.ok).toBe(false);
  });

  it("reports not ready when there is an unresolved source conflict", async () => {
    const { requestId } = await fullyReadyRequest();

    const { data: sourceA } = await admin
      .from("research_sources")
      .insert({ request_id: requestId, origin: "researched", original_url: "https://example.com/b", retrieval_status: "usable" })
      .select()
      .single();
    const { data: sourceB } = await admin
      .from("research_sources")
      .insert({ request_id: requestId, origin: "researched", original_url: "https://example.com/c", retrieval_status: "usable" })
      .select()
      .single();
    await admin
      .from("source_conflicts")
      .insert({ request_id: requestId, source_a_id: sourceA!.id, source_b_id: sourceB!.id, description: "Conflicting claims" });

    const readiness = await getPackageReadiness(owner.client, requestId);
    expect(readiness.ready).toBe(false);
    expect(readiness.checks.find((c) => c.key === "no_unresolved_conflicts")?.ok).toBe(false);
  });
});
