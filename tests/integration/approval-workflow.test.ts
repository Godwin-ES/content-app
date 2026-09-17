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
import { saveManualArticleRevision } from "@/lib/articles/service";
import {
  submitForApproval,
  withdrawApproval,
  decideApproval,
  reopenRejectedRequest,
  getReviewerQueue,
  getPackageReview,
} from "@/lib/approvals/service";
import { getLatestReview, submitPackageForReview } from "@/lib/repositories/approvals";

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

describe.skipIf(!hasCredentials)("approval workflow (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  let reviewer: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "approval-owner");
    reviewer = await createTestUser(admin, "reviewer", "approval-reviewer");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
    await deleteTestUser(admin, reviewer.userId);
  });

  async function createVersion(
    kind: "article" | "linkedin" | "x" | "newsletter",
    requestId: string,
    sourceSetId: string,
    content: unknown,
    actingClient: SupabaseClient<Database> = owner.client
  ) {
    const { data: artifact } = await admin
      .from("content_artifacts")
      .insert({ request_id: requestId, kind, slot: kind === "article" ? "A" : null })
      .select()
      .single();
    const { data: version } = await actingClient.rpc("create_artifact_version", {
      p_artifact_id: artifact!.id,
      p_change_type: kind === "article" ? "initial_generation" : "channel_adaptation",
      p_content: content as Json,
      p_content_hash: `hash-${kind}-${Math.random()}`,
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

  async function fullyReadyRequest(ownerUser: { client: SupabaseClient<Database>; userId: string } = owner) {
    const { data: request } = await admin
      .from("content_requests")
      .insert({
        owner_id: ownerUser.userId,
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
      .insert({ request_id: request!.id, version_number: 1, confirmed_by: ownerUser.userId })
      .select()
      .single();
    await admin.from("source_set_items").insert({ source_set_version_id: sourceSet!.id, source_id: source!.id });
    await admin.from("content_requests").update({ current_source_set_id: sourceSet!.id }).eq("id", request!.id);

    const article = await createVersion("article", request!.id, sourceSet!.id, articleContent(), ownerUser.client);
    await passingEvaluation(article.versionId);
    await admin.from("content_requests").update({ selected_article_version_id: article.versionId }).eq("id", request!.id);

    for (const kind of ["linkedin", "x", "newsletter"] as const) {
      const content = kind === "linkedin" ? linkedinContent() : kind === "x" ? xContent() : newsletterContent();
      const v = await createVersion(kind, request!.id, sourceSet!.id, content, ownerUser.client);
      await passingEvaluation(v.versionId);
    }

    const pkg = await createContentPackage(ownerUser.client, request!.id);
    return { requestId: request!.id, articleArtifactId: article.artifactId, pkg };
  }

  it("makes the exact package read-only while pending review", async () => {
    const { requestId, articleArtifactId, pkg } = await fullyReadyRequest();
    await submitForApproval(owner.client, requestId);

    await expect(
      saveManualArticleRevision(owner.client, articleArtifactId, articleContent("Edited while pending"), owner.userId)
    ).rejects.toMatchObject({ code: "INVALID_STATE" });

    void pkg;
  });

  it("prevents a reviewer from approving a review they themselves submitted (self-approval)", async () => {
    // The request is owned by the reviewer test user here specifically to
    // exercise decide_package_review's own self-approval protection
    // (submitted_by = auth.uid()) directly at the service layer — the
    // app-action layer additionally requires the Content Manager role to
    // submit and the Reviewer role to decide, which would prevent a real
    // single user from reaching this state through the UI at all.
    const { requestId, pkg } = await fullyReadyRequest(reviewer);
    const review = await submitPackageForReview(reviewer.client, requestId, pkg.id);

    await expect(
      decideApproval(reviewer.client, { reviewId: review.id, packageId: pkg.id, decision: "approved", comment: null })
    ).rejects.toMatchObject({ code: "SELF_APPROVAL" });
  });

  it("rejects a decision made against a stale (superseded) package", async () => {
    const { requestId, pkg } = await fullyReadyRequest();
    const review1 = await submitForApproval(owner.client, requestId);
    await withdrawApproval(owner.client, review1.id);

    // A second package version (still against the same, unedited content —
    // creating a new package while editable is allowed even without
    // content changes) and a second submission supersede the first.
    const pkg2 = await createContentPackage(owner.client, requestId);
    const review2 = await submitForApproval(owner.client, requestId);
    expect(pkg2.id).not.toBe(pkg.id);

    await expect(
      decideApproval(reviewer.client, { reviewId: review2.id, packageId: pkg.id, decision: "approved", comment: null })
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("cannot decide a withdrawn review", async () => {
    const { requestId, pkg } = await fullyReadyRequest();
    const review = await submitForApproval(owner.client, requestId);
    await withdrawApproval(owner.client, review.id);

    await expect(
      decideApproval(reviewer.client, { reviewId: review.id, packageId: pkg.id, decision: "approved", comment: null })
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("returns the request to editable content_development on changes_requested, and to rejected/reopenable on rejected", async () => {
    const { requestId, articleArtifactId, pkg } = await fullyReadyRequest();
    const review = await submitForApproval(owner.client, requestId);

    await decideApproval(reviewer.client, { reviewId: review.id, packageId: pkg.id, decision: "changes_requested", comment: "Fix the intro" });

    const { data: afterChanges } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(afterChanges?.status).toBe("changes_requested");

    // Editable again: a manual edit now succeeds.
    const edited = await saveManualArticleRevision(owner.client, articleArtifactId, articleContent("Fixed"), owner.userId);
    expect(edited.change_type).toBe("manual_edit");
    await passingEvaluation(edited.id);
    await admin.from("content_requests").update({ selected_article_version_id: edited.id }).eq("id", requestId);

    // Resubmit and get rejected this time.
    const pkg2 = await createContentPackage(owner.client, requestId);
    const review2 = await submitForApproval(owner.client, requestId);
    await decideApproval(reviewer.client, { reviewId: review2.id, packageId: pkg2.id, decision: "rejected", comment: "Not aligned" });

    const { data: afterRejected } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(afterRejected?.status).toBe("rejected");

    await expect(reopenRejectedRequest(owner.client, requestId)).resolves.toMatchObject({ status: "content_development" });
    await expect(reopenRejectedRequest(owner.client, requestId)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("keeps an approved package immutable and historically correct even after a later edit", async () => {
    const { requestId, articleArtifactId, pkg } = await fullyReadyRequest();
    const review = await submitForApproval(owner.client, requestId);
    await decideApproval(reviewer.client, { reviewId: review.id, packageId: pkg.id, decision: "approved", comment: null });

    const { data: approvedRequest } = await admin.from("content_requests").select().eq("id", requestId).single();
    expect(approvedRequest?.status).toBe("approved");
    expect(approvedRequest?.current_package_id).toBe(pkg.id);

    // Editing after approval is allowed (SYSTEM-DESIGN-NEXTJS.md §24.6): it
    // starts a new unapproved draft and returns the request to
    // content_development, but the already-approved package row itself
    // must remain byte-for-byte untouched as historical truth.
    await saveManualArticleRevision(owner.client, articleArtifactId, articleContent("Post-approval edit"), owner.userId);

    const { data: packageAfterEdit } = await admin.from("content_packages").select().eq("id", pkg.id).single();
    expect(packageAfterEdit?.article_version_id).toBe(pkg.article_version_id);
    expect(packageAfterEdit?.snapshot_hash).toBe(pkg.snapshot_hash);

    const { data: requestAfterEdit } = await admin.from("content_requests").select("current_package_id, status").eq("id", requestId).single();
    expect(requestAfterEdit?.current_package_id).toBe(pkg.id);
    expect(requestAfterEdit?.status).toBe("content_development");
  });

  it("builds a reviewer queue split by status and an exact package review context", async () => {
    const { requestId, pkg } = await fullyReadyRequest();
    await submitForApproval(owner.client, requestId);

    const queue = await getReviewerQueue(reviewer.client);
    expect(queue.awaitingReview.some((c) => c.requestId === requestId)).toBe(true);

    const review = await getLatestReview(reviewer.client, requestId);
    const context = await getPackageReview(reviewer.client, requestId);
    expect(context.package.id).toBe(pkg.id);
    expect(context.review.id).toBe(review!.id);
    expect(context.sources.length).toBeGreaterThan(0);
    expect(context.evaluations.article?.overall_status).toBe("pass");
  });
});
