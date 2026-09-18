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
import { approveCurrentPackage } from "@/lib/approvals/service";
import { getLatestApproval } from "@/lib/repositories/approvals";
import {
  deleteRequest,
  restoreRequest,
  listOwnedRequests,
  listDeletedRequests,
  sweepExpiredRequests,
} from "@/lib/repositories/requests";

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

  it("approves the current package in one act, recording who and when", async () => {
    const { requestId, pkg } = await fullyReadyRequest();

    const approval = await approveCurrentPackage(owner.client, requestId);
    expect(approval.package_id).toBe(pkg.id);
    expect(approval.approved_by).toBe(owner.userId);
    expect(approval.approved_at).not.toBeNull();

    const { data: request } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(request?.status).toBe("approved");
  });

  it("refuses an approval from an account that does not own the request", async () => {
    const { requestId } = await fullyReadyRequest();

    await expect(approveCurrentPackage(stranger.client, requestId)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const { data: request } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(request?.status).toBe("content_development");
  });

  it("refuses a second approval, so a double-click cannot record two", async () => {
    const { requestId } = await fullyReadyRequest();
    await approveCurrentPackage(owner.client, requestId);

    await expect(approveCurrentPackage(owner.client, requestId)).rejects.toMatchObject({ code: "INVALID_STATE" });

    const { count } = await admin
      .from("package_approvals")
      .select("id", { count: "exact", head: true })
      .eq("request_id", requestId);
    expect(count).toBe(1);
  });

  it("keeps an approved package immutable and returns the request to development on a later edit", async () => {
    const { requestId, articleArtifactId, pkg } = await fullyReadyRequest();
    await approveCurrentPackage(owner.client, requestId);

    // Editing after approval is allowed (SYSTEM-DESIGN-NEXTJS.md §24.6):
    // it starts a new unapproved draft, but the approved package row itself
    // must remain byte-for-byte untouched as historical truth.
    await saveManualArticleRevision(owner.client, articleArtifactId, articleContent("Post-approval edit"), owner.userId);

    const { data: packageAfterEdit } = await admin.from("content_packages").select().eq("id", pkg.id).single();
    expect(packageAfterEdit?.article_version_id).toBe(pkg.article_version_id);
    expect(packageAfterEdit?.snapshot_hash).toBe(pkg.snapshot_hash);

    const { data: requestAfterEdit } = await admin
      .from("content_requests")
      .select("current_package_id, status")
      .eq("id", requestId)
      .single();
    expect(requestAfterEdit?.current_package_id).toBe(pkg.id);
    expect(requestAfterEdit?.status).toBe("content_development");

    // The approval stands as history even though the request moved on.
    const approval = await getLatestApproval(owner.client, requestId);
    expect(approval?.package_id).toBe(pkg.id);
  });

  describe("the bin", () => {
    it("moves a request out of the live list and into the bin, reversibly", async () => {
      const { requestId } = await fullyReadyRequest();

      await deleteRequest(owner.client, requestId);

      expect((await listOwnedRequests(owner.client, owner.userId)).some((r) => r.id === requestId)).toBe(false);
      expect((await listDeletedRequests(owner.client, owner.userId)).some((r) => r.id === requestId)).toBe(true);

      await restoreRequest(owner.client, requestId);

      expect((await listOwnedRequests(owner.client, owner.userId)).some((r) => r.id === requestId)).toBe(true);
      expect((await listDeletedRequests(owner.client, owner.userId)).some((r) => r.id === requestId)).toBe(false);
    });

    it("deletes a request at any stage, including an approved one — nothing is lost yet", async () => {
      const { requestId } = await fullyReadyRequest();
      await approveCurrentPackage(owner.client, requestId);

      await expect(deleteRequest(owner.client, requestId)).resolves.toBeUndefined();

      const { data: stillThere } = await admin.from("content_requests").select("deleted_at").eq("id", requestId).single();
      expect(stillThere?.deleted_at).not.toBeNull();
    });

    it("cancels queued publishing items, so a binned request keeps no place in the queue", async () => {
      const { requestId, pkg } = await fullyReadyRequest();
      await approveCurrentPackage(owner.client, requestId);

      const { data: item, error: queueError } = await owner.client.rpc("create_queue_item", {
        p_package_id: pkg.id,
        p_channel: "linkedin",
        p_channel_artifact_version_id: pkg.linkedin_version_id,
        p_scheduled_at: undefined,
        p_timezone: undefined,
        p_idempotency_key: `bin-test-${Math.random()}`,
      });
      expect(queueError).toBeNull();
      expect((item as { status: string }).status).toBe("queued");

      await deleteRequest(owner.client, requestId);

      const { data: afterDelete } = await admin
        .from("publishing_queue_items")
        .select("status")
        .eq("id", (item as { id: string }).id)
        .single();
      expect(afterDelete?.status).toBe("cancelled");
    });

    it("refuses to bin or restore another account's request", async () => {
      const { requestId } = await fullyReadyRequest();

      // Both RPCs are security definer, so they read the row and refuse on
      // ownership rather than failing to find it.
      await expect(deleteRequest(stranger.client, requestId)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

      await deleteRequest(owner.client, requestId);
      await expect(restoreRequest(stranger.client, requestId)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    });

    it("purges a request past the window, unpicking every non-cascading reference", async () => {
      const { requestId } = await fullyReadyRequest();

      // Evidence attached to a real analysis run: source_evidence
      // references operation_runs and does not cascade, which is exactly
      // the ordering the old permanent delete got wrong.
      const { data: source } = await admin.from("research_sources").select("id").eq("request_id", requestId).single();
      const { data: run } = await admin
        .from("operation_runs")
        .insert({ request_id: requestId, operation_type: "source_analysis", status: "succeeded" })
        .select()
        .single();
      await admin.from("source_evidence").insert({
        source_id: source!.id,
        evidence_key: "e1",
        excerpt: "An excerpt.",
        conservative_summary: "A summary.",
        source_analysis_run_id: run!.id,
      });

      await deleteRequest(owner.client, requestId);
      // Backdate past the retention window, then trigger the sweep.
      await admin
        .from("content_requests")
        .update({ deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() })
        .eq("id", requestId);

      await sweepExpiredRequests(owner.client);

      const { data: gone } = await admin.from("content_requests").select("id").eq("id", requestId).maybeSingle();
      expect(gone).toBeNull();
    });

    it("refuses to restore a request past the window", async () => {
      const { requestId } = await fullyReadyRequest();
      await deleteRequest(owner.client, requestId);
      await admin
        .from("content_requests")
        .update({ deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() })
        .eq("id", requestId);

      // Two things refuse this, and either is enough: the sweep that runs
      // first purges the row, and restore_request checks the window itself
      // in case it somehow survived.
      await expect(restoreRequest(owner.client, requestId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("excludes an expired request from the bin even before the sweep removes it", async () => {
      const { requestId } = await fullyReadyRequest();
      await deleteRequest(owner.client, requestId);
      await admin
        .from("content_requests")
        .update({ deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() })
        .eq("id", requestId);

      // The row is still there; the listing must not offer a restore it
      // cannot honour.
      expect((await listDeletedRequests(owner.client, owner.userId)).some((r) => r.id === requestId)).toBe(false);
    });
  });
});
