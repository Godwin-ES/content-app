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
import { submitForApproval, decideApproval } from "@/lib/approvals/service";
import { queueChannel, rescheduleItem, cancelItem, getPublishingQueue } from "@/lib/publishing/service";

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

describe.skipIf(!hasCredentials)("publishing queue (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "publishing-owner");
    
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

  async function approvedRequest() {
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

    const article = await createVersion("article", request!.id, sourceSet!.id, articleContent());
    await passingEvaluation(article.versionId);
    await admin.from("content_requests").update({ selected_article_version_id: article.versionId }).eq("id", request!.id);

    for (const kind of ["linkedin", "x", "newsletter"] as const) {
      const content = kind === "linkedin" ? linkedinContent() : kind === "x" ? xContent() : newsletterContent();
      const v = await createVersion(kind, request!.id, sourceSet!.id, content);
      await passingEvaluation(v.versionId);
    }

    const pkg = await createContentPackage(owner.client, request!.id);
    const review = await submitForApproval(owner.client, request!.id);
    await decideApproval(owner.client, { reviewId: review.id, packageId: pkg.id, decision: "approved", comment: null });

    return { requestId: request!.id, pkg };
  }

  it("refuses to queue an unapproved package", async () => {
    const { data: request } = await admin
      .from("content_requests")
      .insert({
        owner_id: owner.userId,
        topic: "Unapproved",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate",
        resolved_tone: "Professional",
        status: "content_development",
      })
      .select()
      .single();
    requestIds.push(request!.id);

    await expect(queueChannel(owner.client, request!.id, "linkedin", null)).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });

  it("queues each channel of the exact approved package independently", async () => {
    const { requestId, pkg } = await approvedRequest();

    const item = await queueChannel(owner.client, requestId, "linkedin", null);
    expect(item.status).toBe("queued");
    expect(item.package_id).toBe(pkg.id);
    expect(item.channel_artifact_version_id).toBe(pkg.linkedin_version_id);

    const queue = await getPublishingQueue(owner.client, requestId);
    expect(queue.queueableChannels.sort()).toEqual(["newsletter", "x"]);
  });

  it("prevents a second active item for the same package/channel (double-click safety)", async () => {
    const { requestId } = await approvedRequest();
    await queueChannel(owner.client, requestId, "x", null);

    await expect(queueChannel(owner.client, requestId, "x", null)).rejects.toMatchObject({ code: "DUPLICATE_QUEUE_ITEM" });
  });

  it("rejects a past scheduled time and requires a timezone", async () => {
    const { requestId } = await approvedRequest();
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await expect(
      queueChannel(owner.client, requestId, "linkedin", { scheduledAt: past, timezone: "UTC" })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      queueChannel(owner.client, requestId, "linkedin", { scheduledAt: future, timezone: "" })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("reschedules without requiring content reapproval, and preserves a cancelled item as history", async () => {
    const { requestId } = await approvedRequest();
    const future1 = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const future2 = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const item = await queueChannel(owner.client, requestId, "newsletter", { scheduledAt: future1, timezone: "UTC" });
    expect(item.status).toBe("scheduled");

    const rescheduled = await rescheduleItem(owner.client, item.id, { scheduledAt: future2, timezone: "UTC" });
    expect(rescheduled.scheduled_at).not.toBe(item.scheduled_at);

    const { data: requestAfter } = await admin.from("content_requests").select("status").eq("id", requestId).single();
    expect(requestAfter?.status).toBe("approved");

    const cancelled = await cancelItem(owner.client, item.id, "No longer needed");
    expect(cancelled.status).toBe("cancelled");

    const queue = await getPublishingQueue(owner.client, requestId);
    const entry = queue.entries.find((e) => e.item.id === item.id)!;
    expect(entry.item.status).toBe("cancelled");
    expect(entry.events.map((e) => e.event_type)).toEqual(["created", "rescheduled", "cancelled"]);
    // Newsletter is active again for a fresh queue attempt after cancellation.
    expect(queue.queueableChannels).toContain("newsletter");
  });

  it("never mutates an existing queued item when the content is edited into a new package", async () => {
    const { requestId, pkg } = await approvedRequest();
    const item = await queueChannel(owner.client, requestId, "linkedin", null);

    const { data: articleArtifactId } = await admin
      .from("artifact_versions")
      .select("artifact_id")
      .eq("id", pkg.article_version_id)
      .single();
    const { saveManualArticleRevision } = await import("@/lib/articles/service");
    await saveManualArticleRevision(owner.client, articleArtifactId!.artifact_id, articleContent("Edited after approval"), owner.userId);

    const { data: itemAfterEdit } = await admin.from("publishing_queue_items").select().eq("id", item.id).single();
    expect(itemAfterEdit?.package_id).toBe(pkg.id);
    expect(itemAfterEdit?.channel_artifact_version_id).toBe(pkg.linkedin_version_id);
    expect(itemAfterEdit?.status).toBe("queued");
  });
});
