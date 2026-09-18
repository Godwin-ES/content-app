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
import {
  recordSourceDecision,
  createSourceConflict,
  resolveSourceConflict,
  confirmSourceSet,
} from "@/lib/repositories/sources";
import { confirmReviewedSourceSet, assessRequestKeywordCoverage } from "@/lib/research/service";

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("Source Review (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "source-review-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  async function newRequest() {
    const { data } = await admin
      .from("content_requests")
      .insert({
        owner_id: owner.userId,
        topic: "Source review test",
        resolved_audience: "a",
        resolved_objective: "b",
        resolved_tone: "c",
        status: "source_review",
      })
      .select()
      .single();
    requestIds.push(data!.id);
    return data!;
  }

  async function newSource(requestId: string, overrides: Partial<Database["public"]["Tables"]["research_sources"]["Insert"]>) {
    const { data } = await admin
      .from("research_sources")
      .insert({ request_id: requestId, origin: "researched", retrieval_status: "usable", ...overrides })
      .select()
      .single();
    return data!;
  }

  it("does not auto-accept a user-supplied source", async () => {
    const request = await newRequest();
    const source = await newSource(request.id, { origin: "user_url", original_url: "https://example.com/user" });

    const { getLatestSourceDecision } = await import("@/lib/repositories/sources");
    const decision = await getLatestSourceDecision(owner.client, source.id);
    expect(decision).toBeNull();
  });

  it("rejects accepting a failed source", async () => {
    const request = await newRequest();
    const source = await newSource(request.id, { retrieval_status: "failed", retrieval_error: "404" });

    await expect(
      recordSourceDecision(owner.client, { sourceId: source.id, decision: "accepted", reason: null, decidedBy: owner.userId })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("requires at least one usable accepted source to confirm", async () => {
    const request = await newRequest();
    await newSource(request.id, { retrieval_status: "failed" });

    await expect(confirmSourceSet(owner.client, request.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("blocks confirmation while a source conflict is unresolved", async () => {
    const request = await newRequest();
    const sourceA = await newSource(request.id, { original_url: "https://example.com/a" });
    const sourceB = await newSource(request.id, { original_url: "https://example.com/b" });
    await recordSourceDecision(owner.client, { sourceId: sourceA.id, decision: "accepted", reason: null, decidedBy: owner.userId });
    await recordSourceDecision(owner.client, { sourceId: sourceB.id, decision: "accepted", reason: null, decidedBy: owner.userId });

    await createSourceConflict(owner.client, {
      requestId: request.id,
      sourceAId: sourceA.id,
      sourceBId: sourceB.id,
      description: "Sources disagree on the reported percentage.",
    });

    await expect(confirmSourceSet(owner.client, request.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("confirms after the conflict is resolved, creating an immutable source set and transitioning the request", async () => {
    const request = await newRequest();
    const sourceA = await newSource(request.id, { original_url: "https://example.com/a2" });
    const sourceB = await newSource(request.id, { original_url: "https://example.com/b2" });
    await recordSourceDecision(owner.client, { sourceId: sourceA.id, decision: "accepted", reason: null, decidedBy: owner.userId });
    await recordSourceDecision(owner.client, { sourceId: sourceB.id, decision: "accepted", reason: null, decidedBy: owner.userId });

    const conflict = await createSourceConflict(owner.client, {
      requestId: request.id,
      sourceAId: sourceA.id,
      sourceBId: sourceB.id,
      description: "Sources disagree.",
    });
    await resolveSourceConflict(owner.client, {
      conflictId: conflict.id,
      resolution: "prefer_source_a",
      note: "Source A is more recent.",
      resolvedBy: owner.userId,
    });

    const sourceSet = await confirmSourceSet(owner.client, request.id);
    expect(sourceSet.version_number).toBe(1);

    const { data: updatedRequest } = await admin.from("content_requests").select("status").eq("id", request.id).single();
    expect(updatedRequest?.status).toBe("content_development");
  });

  it("creates Source Set v2 without mutating v1 when accepted sources change later", async () => {
    const request = await newRequest();
    const sourceA = await newSource(request.id, { original_url: "https://example.com/a3" });
    await recordSourceDecision(owner.client, { sourceId: sourceA.id, decision: "accepted", reason: null, decidedBy: owner.userId });

    const v1 = await confirmSourceSet(owner.client, request.id);
    expect(v1.version_number).toBe(1);

    // Move the request back into source_review to accept a second source and reconfirm.
    await admin.from("content_requests").update({ status: "source_review" }).eq("id", request.id);
    const sourceB = await newSource(request.id, { original_url: "https://example.com/b3" });
    await recordSourceDecision(owner.client, { sourceId: sourceB.id, decision: "accepted", reason: null, decidedBy: owner.userId });

    const v2 = await confirmSourceSet(owner.client, request.id);
    expect(v2.version_number).toBe(2);
    expect(v2.id).not.toBe(v1.id);

    const { data: v1Items } = await admin.from("source_set_items").select("source_id").eq("source_set_version_id", v1.id);
    expect(v1Items).toHaveLength(1);
    const { data: v2Items } = await admin.from("source_set_items").select("source_id").eq("source_set_version_id", v2.id);
    expect(v2Items).toHaveLength(2);
  });

  describe("keyword coverage gate", () => {
    async function keywordRequest(keyword: string) {
      const { data } = await admin
        .from("content_requests")
        .insert({
          owner_id: owner.userId,
          topic: "Source review test",
          resolved_audience: "a",
          resolved_objective: "b",
          resolved_tone: "c",
          resolved_primary_keyword: keyword,
          status: "source_review",
        })
        .select()
        .single();
      requestIds.push(data!.id);
      return data!;
    }

    it("refuses to confirm when no accepted researched source mentions the keyword", async () => {
      const request = await keywordRequest("ai recruiting agents");
      const source = await newSource(request.id, {
        original_url: "https://example.com/kw-miss",
        title: "Warehouse robotics in 2026",
        extracted_text: "A long article about conveyor belts and warehouse automation.",
      });
      await recordSourceDecision(owner.client, { sourceId: source.id, decision: "accepted", reason: null, decidedBy: owner.userId });

      await expect(confirmReviewedSourceSet(owner.client, request.id)).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });

      const { data: unchanged } = await admin.from("content_requests").select("status").eq("id", request.id).single();
      expect(unchanged?.status).toBe("source_review");
    });

    it("confirms once a source covering the keyword is accepted", async () => {
      const request = await keywordRequest("ai recruiting agents");
      const miss = await newSource(request.id, {
        original_url: "https://example.com/kw-miss-2",
        extracted_text: "Conveyor belts and warehouse automation.",
      });
      const hit = await newSource(request.id, {
        original_url: "https://example.com/kw-hit",
        title: "AI Recruiting Agents, explained",
        extracted_text: "How AI recruiting agents shortlist candidates.",
      });
      await recordSourceDecision(owner.client, { sourceId: miss.id, decision: "accepted", reason: null, decidedBy: owner.userId });
      await recordSourceDecision(owner.client, { sourceId: hit.id, decision: "accepted", reason: null, decidedBy: owner.userId });

      const sourceSet = await confirmReviewedSourceSet(owner.client, request.id);
      expect(sourceSet.version_number).toBe(1);
    });

    it("counts only accepted sources, so excluding the one that covered the keyword blocks", async () => {
      const request = await keywordRequest("ai recruiting agents");
      const miss = await newSource(request.id, {
        original_url: "https://example.com/kw-miss-3",
        extracted_text: "Conveyor belts and warehouse automation.",
      });
      const hit = await newSource(request.id, {
        original_url: "https://example.com/kw-hit-2",
        extracted_text: "How AI recruiting agents shortlist candidates.",
      });
      await recordSourceDecision(owner.client, { sourceId: miss.id, decision: "accepted", reason: null, decidedBy: owner.userId });
      await recordSourceDecision(owner.client, { sourceId: hit.id, decision: "excluded", reason: "Off topic.", decidedBy: owner.userId });

      const coverage = await assessRequestKeywordCoverage(owner.client, request.id);
      expect(coverage.covered).toBe(false);
      expect(coverage.blocking).toBe(true);
      await expect(confirmReviewedSourceSet(owner.client, request.id)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("warns but confirms when every accepted source is the user's own material", async () => {
      const request = await keywordRequest("ai recruiting agents");
      const supplied = await newSource(request.id, {
        origin: "user_url",
        original_url: "https://example.com/kw-supplied",
        extracted_text: "An internal note about payroll processing.",
      });
      await recordSourceDecision(owner.client, { sourceId: supplied.id, decision: "accepted", reason: null, decidedBy: owner.userId });

      const coverage = await assessRequestKeywordCoverage(owner.client, request.id);
      expect(coverage.covered).toBe(false);
      expect(coverage.suppliedOnly).toBe(true);
      expect(coverage.blocking).toBe(false);

      const sourceSet = await confirmReviewedSourceSet(owner.client, request.id);
      expect(sourceSet.version_number).toBe(1);
    });

    it("does not gate a request with no primary keyword", async () => {
      const request = await newRequest();
      const source = await newSource(request.id, {
        original_url: "https://example.com/kw-none",
        extracted_text: "Conveyor belts and warehouse automation.",
      });
      await recordSourceDecision(owner.client, { sourceId: source.id, decision: "accepted", reason: null, decidedBy: owner.userId });

      const sourceSet = await confirmReviewedSourceSet(owner.client, request.id);
      expect(sourceSet.version_number).toBe(1);
    });
  });

});
