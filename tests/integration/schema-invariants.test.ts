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

/**
 * Exercises the critical cross-row invariants from SYSTEM-DESIGN-NEXTJS.md §33
 * that must be enforced at the database boundary, not only by the UI:
 * self-approval, exact-version staleness, one pending review per request, and
 * duplicate active queue items. Deeper per-RPC functional coverage (source
 * review, article generation, channel evaluation, etc.) belongs to the
 * dedicated integration tests written alongside those later tasks.
 */

async function rpcOrThrow<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("RPC returned no data");
  return data;
}

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("schema invariants (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  let reviewer: { client: SupabaseClient<Database>; userId: string };
  let otherOwner: { client: SupabaseClient<Database>; userId: string };

  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "owner");
    reviewer = await createTestUser(admin, "reviewer", "reviewer");
    otherOwner = await createTestUser(admin, "content_manager", "other-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) {
      await admin.from("content_requests").delete().in("id", requestIds);
    }
    await deleteTestUser(admin, owner.userId);
    await deleteTestUser(admin, reviewer.userId);
    await deleteTestUser(admin, otherOwner.userId);
  });

  /**
   * Builds a request through to a submitted, decidable package using a mix
   * of direct admin fixture rows (source set / plan — these get their own
   * RPC-level tests in Task 10/11) and the real create_artifact_version /
   * create_content_package / submit_package_for_review RPCs under test here.
   */
  async function buildSubmittedFixture() {
    const { data: request, error: requestError } = await admin
      .from("content_requests")
      .insert({
        owner_id: owner.userId,
        topic: "AI agents in recruiting",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate and build authority",
        resolved_tone: "Professional",
        status: "content_development",
      })
      .select()
      .single();
    if (requestError || !request) throw requestError;
    requestIds.push(request.id);

    const { data: source, error: sourceError } = await admin
      .from("research_sources")
      .insert({
        request_id: request.id,
        origin: "researched",
        original_url: "https://example.com/article",
        canonical_url: "https://example.com/article",
        retrieval_status: "usable",
        extracted_text: "Some teams reported reduced administrative workload.",
        retrieved_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (sourceError || !source) throw sourceError;

    const { data: sourceSet, error: sourceSetError } = await admin
      .from("source_set_versions")
      .insert({ request_id: request.id, version_number: 1, confirmed_by: owner.userId })
      .select()
      .single();
    if (sourceSetError || !sourceSet) throw sourceSetError;

    await admin.from("source_set_items").insert({ source_set_version_id: sourceSet.id, source_id: source.id });
    await admin.from("content_requests").update({ current_source_set_id: sourceSet.id }).eq("id", request.id);

    const kinds: Array<{ kind: "article" | "linkedin" | "x" | "newsletter"; slot: "A" | null }> = [
      { kind: "article", slot: "A" },
      { kind: "linkedin", slot: null },
      { kind: "x", slot: null },
      { kind: "newsletter", slot: null },
    ];

    const versionIds: Record<string, string> = {};
    const evaluationIds: Record<string, string> = {};

    for (const { kind, slot } of kinds) {
      const { data: artifact, error: artifactError } = await admin
        .from("content_artifacts")
        .insert({ request_id: request.id, kind, slot })
        .select()
        .single();
      if (artifactError || !artifact) throw artifactError;

      const version = await rpcOrThrow(
        owner.client.rpc("create_artifact_version", {
          p_artifact_id: artifact.id,
          p_expected_current_version_id: undefined,
          p_change_type: "initial_generation",
          p_content: { title: `${kind} content` },
          p_content_hash: `hash-${kind}`,
          p_source_set_version_id: sourceSet.id,
          p_content_plan_id: undefined,
          p_base_article_version_id: undefined,
        })
      );
      versionIds[kind] = version.id;

      const { data: evaluation, error: evaluationError } = await admin
        .from("evaluations")
        .insert({ artifact_version_id: version.id, overall_status: "pass" })
        .select()
        .single();
      if (evaluationError || !evaluation) throw evaluationError;
      evaluationIds[kind] = evaluation.id;
    }

    const pkg = await rpcOrThrow(
      owner.client.rpc("create_content_package", {
        p_request_id: request.id,
        p_article_version_id: versionIds.article,
        p_article_evaluation_id: evaluationIds.article,
        p_linkedin_version_id: versionIds.linkedin,
        p_linkedin_evaluation_id: evaluationIds.linkedin,
        p_x_version_id: versionIds.x,
        p_x_evaluation_id: evaluationIds.x,
        p_newsletter_version_id: versionIds.newsletter,
        p_newsletter_evaluation_id: evaluationIds.newsletter,
        p_snapshot: { title: "snapshot" },
        p_snapshot_hash: "snapshot-hash",
      })
    );

    const review = await rpcOrThrow(
      owner.client.rpc("submit_package_for_review", {
        p_request_id: request.id,
        p_package_id: pkg.id,
      })
    );

    return { requestId: request.id, articleArtifactVersionId: versionIds.article, package: pkg, review };
  }

  it("rejects self-approval when the submitter tries to decide their own review", async () => {
    const { review, package: pkg } = await buildSubmittedFixture();

    await expect(
      rpcOrThrow(
        owner.client.rpc("decide_package_review", {
          p_review_id: review.id,
          p_package_id: pkg.id,
          p_decision: "approved",
          p_comment: undefined,
        })
      )
    ).rejects.toThrow(/SELF_APPROVAL|PERMISSION/);
  });

  it("rejects a decision from a content manager who did not submit the review (role check)", async () => {
    const { review, package: pkg } = await buildSubmittedFixture();

    await expect(
      rpcOrThrow(
        otherOwner.client.rpc("decide_package_review", {
          p_review_id: review.id,
          p_package_id: pkg.id,
          p_decision: "approved",
          p_comment: undefined,
        })
      )
    ).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("lets an independent reviewer approve, and rejects a second decision on the same review", async () => {
    const { review, package: pkg } = await buildSubmittedFixture();

    const approved = await rpcOrThrow(
      reviewer.client.rpc("decide_package_review", {
        p_review_id: review.id,
        p_package_id: pkg.id,
        p_decision: "approved",
        p_comment: "Looks good.",
      })
    );
    expect(approved.status).toBe("approved");

    await expect(
      rpcOrThrow(
        reviewer.client.rpc("decide_package_review", {
          p_review_id: review.id,
          p_package_id: pkg.id,
          p_decision: "approved",
          p_comment: undefined,
        })
      )
    ).rejects.toThrow(/INVALID_STATE/);
  });

  it("rejects a stale expected version when creating a new artifact version", async () => {
    const { articleArtifactVersionId } = await buildSubmittedFixture();
    const { data: artifactVersion } = await admin
      .from("artifact_versions")
      .select("artifact_id")
      .eq("id", articleArtifactVersionId)
      .single();

    await expect(
      rpcOrThrow(
        owner.client.rpc("create_artifact_version", {
          p_artifact_id: artifactVersion!.artifact_id,
          p_expected_current_version_id: "00000000-0000-0000-0000-000000000000",
          p_change_type: "manual_edit",
          p_content: { title: "edited" },
          p_content_hash: "hash-edited",
          p_source_set_version_id: undefined,
          p_content_plan_id: undefined,
          p_base_article_version_id: undefined,
        })
      )
    ).rejects.toThrow(/STALE_VERSION/);
  });

  it("rejects submitting a second package while a review is already pending for the request", async () => {
    const { requestId, package: pkg } = await buildSubmittedFixture();

    await expect(
      rpcOrThrow(
        owner.client.rpc("submit_package_for_review", {
          p_request_id: requestId,
          p_package_id: pkg.id,
        })
      )
    ).rejects.toThrow(/INVALID_STATE/);
  });

  it("prevents a duplicate active queue item for the same package/channel", async () => {
    const { review, package: pkg } = await buildSubmittedFixture();
    await rpcOrThrow(
      reviewer.client.rpc("decide_package_review", {
        p_review_id: review.id,
        p_package_id: pkg.id,
        p_decision: "approved",
        p_comment: undefined,
      })
    );

    const first = await rpcOrThrow(
      owner.client.rpc("create_queue_item", {
        p_package_id: pkg.id,
        p_channel: "linkedin",
        p_channel_artifact_version_id: pkg.linkedin_version_id,
        p_scheduled_at: undefined,
        p_timezone: undefined,
        p_idempotency_key: crypto.randomUUID(),
      })
    );
    expect(first.status).toBe("queued");

    await expect(
      rpcOrThrow(
        owner.client.rpc("create_queue_item", {
          p_package_id: pkg.id,
          p_channel: "linkedin",
          p_channel_artifact_version_id: pkg.linkedin_version_id,
          p_scheduled_at: undefined,
          p_timezone: undefined,
          p_idempotency_key: crypto.randomUUID(),
        })
      )
    ).rejects.toThrow(/DUPLICATE_QUEUE_ITEM/);

    const { data: activeItems } = await admin
      .from("publishing_queue_items")
      .select("id")
      .eq("package_id", pkg.id)
      .eq("channel", "linkedin")
      .in("status", ["queued", "scheduled"]);
    expect(activeItems).toHaveLength(1);
  });

  it("reuses the existing row when the same idempotency key is retried, never inserting twice", async () => {
    const { review, package: pkg } = await buildSubmittedFixture();
    await rpcOrThrow(
      reviewer.client.rpc("decide_package_review", {
        p_review_id: review.id,
        p_package_id: pkg.id,
        p_decision: "approved",
        p_comment: undefined,
      })
    );

    const idempotencyKey = crypto.randomUUID();
    const first = await rpcOrThrow(
      owner.client.rpc("create_queue_item", {
        p_package_id: pkg.id,
        p_channel: "x",
        p_channel_artifact_version_id: pkg.x_version_id,
        p_scheduled_at: undefined,
        p_timezone: undefined,
        p_idempotency_key: idempotencyKey,
      })
    );
    const retry = await rpcOrThrow(
      owner.client.rpc("create_queue_item", {
        p_package_id: pkg.id,
        p_channel: "x",
        p_channel_artifact_version_id: pkg.x_version_id,
        p_scheduled_at: undefined,
        p_timezone: undefined,
        p_idempotency_key: idempotencyKey,
      })
    );

    expect(retry.id).toBe(first.id);
  });

  it("blocks queueing a package that has not been approved", async () => {
    const { package: pkg } = await buildSubmittedFixture();

    await expect(
      rpcOrThrow(
        owner.client.rpc("create_queue_item", {
          p_package_id: pkg.id,
          p_channel: "newsletter",
          p_channel_artifact_version_id: pkg.newsletter_version_id,
          p_scheduled_at: undefined,
          p_timezone: undefined,
          p_idempotency_key: crypto.randomUUID(),
        })
      )
    ).rejects.toThrow(/APPROVAL_REQUIRED/);
  });
});
