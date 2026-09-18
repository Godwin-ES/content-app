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
import { createContentPackage } from "@/lib/packages/service";
import { getSamplePack } from "@/lib/sample-pack/service";

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
  return { subject: "Subject", introduction: "Intro", bodyMarkdown: "Body", callToAction: "Read more", signoff: "Best" };
}

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("sample pack (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "sample-pack-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  async function createVersion(kind: "article" | "linkedin" | "x" | "newsletter", requestId: string, sourceSetId: string, content: unknown) {
    const { data: artifact } = await admin
      .from("content_artifacts")
      .insert({ request_id: requestId, kind, slot: kind === "article" ? "A" : null })
      .select()
      .single();
    const { data: version } = await owner.client.rpc("create_artifact_version", {
      p_artifact_id: artifact!.id,
      p_change_type: kind === "article" ? "initial_generation" : "channel_adaptation",
      p_content: content as Json,
      p_content_hash: `hash-${kind}-${Math.random()}`,
      p_source_set_version_id: sourceSetId,
    });
    return { artifactId: artifact!.id, versionId: (version as { id: string }).id };
  }

  async function passingEvaluation(versionId: string) {
    await admin.from("evaluations").insert({
      artifact_version_id: versionId,
      overall_status: "pass",
      deterministic_checks: [],
      criteria: [],
      claim_audit: [],
      unsupported_claims: [],
      sections_needing_revision: [],
    });
  }

  it("assembles the exact package content, not whatever is currently mutable", async () => {
    const { data: request } = await admin
      .from("content_requests")
      .insert({
        owner_id: owner.userId,
        topic: "AI agents in recruiting",
        supplied_audience: "Recruiters",
        resolved_audience: "HR leaders at mid-size companies",
        resolved_objective: "Educate",
        resolved_tone: "Professional",
        status: "content_development",
      })
      .select()
      .single();
    requestIds.push(request!.id);

    const { data: source } = await admin
      .from("research_sources")
      .insert({ request_id: request!.id, origin: "researched", original_url: "https://example.com/a", retrieval_status: "usable", title: "HR Tech Journal Article" })
      .select()
      .single();
    const { data: sourceSet } = await admin
      .from("source_set_versions")
      .insert({ request_id: request!.id, version_number: 1, confirmed_by: owner.userId })
      .select()
      .single();
    await admin.from("source_set_items").insert({ source_set_version_id: sourceSet!.id, source_id: source!.id });
    await admin.from("content_requests").update({ current_source_set_id: sourceSet!.id }).eq("id", request!.id);

    const article = await createVersion("article", request!.id, sourceSet!.id, articleContent("Original Title"));
    await passingEvaluation(article.versionId);
    await admin.from("content_requests").update({ selected_article_version_id: article.versionId }).eq("id", request!.id);

    const linkedin = await createVersion("linkedin", request!.id, sourceSet!.id, linkedinContent());
    await passingEvaluation(linkedin.versionId);
    const x = await createVersion("x", request!.id, sourceSet!.id, xContent());
    await passingEvaluation(x.versionId);
    const newsletter = await createVersion("newsletter", request!.id, sourceSet!.id, newsletterContent());
    await passingEvaluation(newsletter.versionId);

    const pkg = await createContentPackage(owner.client, request!.id);

    // A later edit creates a new mutable "current" article version, but the
    // package (and therefore the sample pack) must still show the original.
    await owner.client.rpc("create_artifact_version", {
      p_artifact_id: article.artifactId,
      p_expected_current_version_id: article.versionId,
      p_change_type: "manual_edit",
      p_content: articleContent("Edited After Packaging") as Json,
      p_content_hash: "hash-article-edited",
      p_source_set_version_id: sourceSet!.id,
    });

    const pack = await getSamplePack(owner.client, request!.id);

    expect(pack.packageVersion).toBe(pkg.version_number);
    expect(pack.article.title).toBe("Original Title");
    expect(pack.assumptions.suppliedAudience).toBe("Recruiters");
    expect(pack.assumptions.resolvedAudience).toBe("HR leaders at mid-size companies");
    expect(pack.reviewedSources).toHaveLength(1);
    expect(pack.reviewedSources[0].title).toBe("HR Tech Journal Article");
    expect(pack.linkedin.body).toBe("A LinkedIn post.");
    expect(pack.x.body).toBe("An X post.");
    expect(pack.newsletter.subject).toBe("Subject");
    expect(pack.evaluationSummary.article).toContain("pass");
  });

  it("throws a clear domain error when the request has no package yet", async () => {
    const { data: request } = await admin
      .from("content_requests")
      .insert({
        owner_id: owner.userId,
        topic: "No package yet",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate",
        resolved_tone: "Professional",
        status: "content_development",
      })
      .select()
      .single();
    requestIds.push(request!.id);

    await expect(getSamplePack(owner.client, request!.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
