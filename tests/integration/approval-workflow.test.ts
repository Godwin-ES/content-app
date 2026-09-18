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
  decideOwnPackage,
  withdrawApproval,
  decideApproval,
} from "@/lib/approvals/service";
import { submitPackageForReview } from "@/lib/repositories/approvals";
import { deleteRequest } from "@/lib/repositories/requests";

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
  let stranger: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "approval-owner");
    stranger = await createTestUser(admin, "approval-stranger");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
    await deleteTestUser(admin, stranger.userId);
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

  it("lets the owner approve their own package — there is no one else to", async () => {
    // decide_package_review used to refuse this outright (SELF_APPROVAL).
    // With one account per workspace, the only person who can see a request
    // is the one who created it, so that rule would have made approval
    // impossible rather than safe. The gate that matters — a human
    // deliberately deciding on a specific package version, recorded — is
    // exactly what this asserts still happens.
    const { requestId, pkg } = await fullyReadyRequest();
    const review = await decideOwnPackage(owner.client, requestId, "approved", null);

    expect(review.package_id).toBe(pkg.id);
    expect(review.status).toBe("approved");
    expect(review.submitted_by).toBe(owner.userId);
    expect(review.decided_by).toBe(owner.userId);
    expect(review.decided_at).not.toBeNull();

    const { data: request } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(request?.status).toBe("approved");
  });

  it("decides a review that is already pending instead of opening a second one", async () => {
    const { requestId, pkg } = await fullyReadyRequest();
    const pending = await submitForApproval(owner.client, requestId);

    const decided = await decideOwnPackage(owner.client, requestId, "changes_requested", "Tighten the intro");
    expect(decided.id).toBe(pending.id);

    const { count } = await admin
      .from("approval_reviews")
      .select("id", { count: "exact", head: true })
      .eq("request_id", requestId);
    expect(count).toBe(1);
    void pkg;
  });

  it("refuses to record changes_requested with no comment", async () => {
    const { requestId } = await fullyReadyRequest();
    await expect(decideOwnPackage(owner.client, requestId, "changes_requested", null)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("refuses a decision from an account that does not own the request", async () => {
    const { requestId, pkg } = await fullyReadyRequest();
    const review = await submitForApproval(owner.client, requestId);

    await expect(
      decideApproval(stranger.client, { reviewId: review.id, packageId: pkg.id, decision: "approved", comment: null })
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("returns a withdrawn request to an editable status, so it lands back in the dashboard's In Progress", async () => {
    const { requestId, pkg } = await fullyReadyRequest();
    const review = await submitForApproval(owner.client, requestId);

    const { data: whileSubmitted } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(whileSubmitted?.status).toBe("pending_approval");

    await withdrawApproval(owner.client, review.id);

    // The dashboard's Withdraw submission button depends on this: a
    // withdrawn request has to leave "Awaiting Approval" and become
    // editable (and deletable) again rather than sitting in limbo.
    const { data: afterWithdraw } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(afterWithdraw?.status).toBe("content_development");
    void pkg;
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
      decideApproval(owner.client, { reviewId: review2.id, packageId: pkg.id, decision: "approved", comment: null })
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("cannot decide a withdrawn review", async () => {
    const { requestId, pkg } = await fullyReadyRequest();
    const review = await submitForApproval(owner.client, requestId);
    await withdrawApproval(owner.client, review.id);

    await expect(
      decideApproval(owner.client, { reviewId: review.id, packageId: pkg.id, decision: "approved", comment: null })
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("makes the request editable again on changes_requested and resubmits straight through to approval", async () => {
    const { requestId, articleArtifactId, pkg } = await fullyReadyRequest();
    const review = await submitForApproval(owner.client, requestId);

    await decideApproval(owner.client, { reviewId: review.id, packageId: pkg.id, decision: "changes_requested", comment: "Fix the intro" });

    const { data: afterChanges } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(afterChanges?.status).toBe("changes_requested");

    // Editable again: a manual edit now succeeds.
    const edited = await saveManualArticleRevision(owner.client, articleArtifactId, articleContent("Fixed"), owner.userId);
    expect(edited.change_type).toBe("manual_edit");
    await passingEvaluation(edited.id);
    await admin.from("content_requests").update({ selected_article_version_id: edited.id }).eq("id", requestId);

    // Request Changes is the only route back, so resubmission has to work
    // directly from `changes_requested` with no intermediate reopen step.
    const pkg2 = await createContentPackage(owner.client, requestId);
    const review2 = await submitForApproval(owner.client, requestId);
    await decideApproval(owner.client, { reviewId: review2.id, packageId: pkg2.id, decision: "approved", comment: null });

    const { data: afterApproval } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(afterApproval?.status).toBe("approved");
  });

  it("allows deleting a request with generated content, but refuses once a review decision exists", async () => {
    const { requestId, pkg } = await fullyReadyRequest();

    // Well past draft, with a plan, artifacts, versions and a package —
    // deletion has to unpick the provenance FKs that do not cascade.
    const review = await submitPackageForReview(owner.client, requestId, pkg.id);
    await expect(deleteRequest(owner.client, requestId)).resolves.toBeUndefined();

    const { data: gone } = await admin.from("content_requests").select("id").eq("id", requestId).maybeSingle();
    expect(gone).toBeNull();
    void review;

    // A second request that has an actual recorded decision.
    const second = await fullyReadyRequest();
    requestIds.push(second.requestId);
    const secondReview = await submitPackageForReview(owner.client, second.requestId, second.pkg.id);
    await decideApproval(owner.client, {
      reviewId: secondReview.id,
      packageId: second.pkg.id,
      decision: "changes_requested",
      comment: "Tighten the intro",
    });

    await expect(deleteRequest(owner.client, second.requestId)).rejects.toMatchObject({ code: "INVALID_STATE" });

    const { data: kept } = await admin.from("content_requests").select("id").eq("id", second.requestId).maybeSingle();
    expect(kept).not.toBeNull();
  });

  it("refuses a 'rejected' decision outright — there is only approve/changes_requested", async () => {
    const { requestId, pkg } = await fullyReadyRequest();
    const review = await submitForApproval(owner.client, requestId);

    await expect(
      decideApproval(owner.client, {
        reviewId: review.id,
        packageId: pkg.id,
        // Cast past the narrowed ReviewDecision type on purpose: the point
        // is that the database refuses it even if a caller bypasses TypeScript.
        decision: "rejected" as never,
        comment: "Not aligned",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const { data: unchanged } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(unchanged?.status).toBe("pending_approval");
  });

  it("keeps an approved package immutable and historically correct even after a later edit", async () => {
    const { requestId, articleArtifactId, pkg } = await fullyReadyRequest();
    const review = await submitForApproval(owner.client, requestId);
    await decideApproval(owner.client, { reviewId: review.id, packageId: pkg.id, decision: "approved", comment: null });

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

});
