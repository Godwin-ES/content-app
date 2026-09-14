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
import { generateContentPlan, saveManualContentPlan } from "@/lib/planning/service";

const VALID_PLAN = {
  insufficientEvidence: false,
  insufficientEvidenceReason: null,
  primaryKeyword: "ai agents in recruiting",
  secondaryKeywords: ["recruiting automation"],
  searchIntent: "informational",
  angle: "practical",
  title: "AI Agents in Recruiting",
  sections: [
    { heading: "Introduction", level: "h2" as const, purpose: "intro", hasFactualClaims: true, evidenceIds: ["S1:E1"] },
    { heading: "Conclusion", level: "h2" as const, purpose: "wrap up", hasFactualClaims: false, evidenceIds: [] },
  ],
  ctaDirection: null,
  links: [],
  knownLimitations: null,
};

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("content planning (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "planning-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  async function requestWithConfirmedSourceSet() {
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
      .insert({
        request_id: request!.id,
        origin: "researched",
        original_url: "https://example.com/a",
        retrieval_status: "usable",
      })
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

    const { data: refreshedRequest } = await admin.from("content_requests").select().eq("id", request!.id).single();
    return refreshedRequest!;
  }

  it("generates and persists a plan tied to the exact confirmed source set", async () => {
    const request = await requestWithConfirmedSourceSet();
    const ai = new FakeAIProvider([VALID_PLAN]);

    const plan = await generateContentPlan(owner.client, ai, "fake-model", request.id);

    expect(plan.version_number).toBe(1);
    expect(plan.source_set_version_id).toBe(request.current_source_set_id);
    expect(plan.title).toBe("AI Agents in Recruiting");

    const { data: updatedRequest } = await admin.from("content_requests").select("current_plan_id").eq("id", request.id).single();
    expect(updatedRequest?.current_plan_id).toBe(plan.id);
  });

  it("rejects a plan with a factual section but no valid evidence IDs, even though the AI output was valid JSON", async () => {
    const request = await requestWithConfirmedSourceSet();
    const invalidPlan = {
      ...VALID_PLAN,
      sections: [{ heading: "Intro", level: "h2" as const, purpose: "intro", hasFactualClaims: true, evidenceIds: ["S9:E9"] }],
    };
    const ai = new FakeAIProvider([invalidPlan]);

    await expect(generateContentPlan(owner.client, ai, "fake-model", request.id)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    const { data: plans } = await admin.from("content_plans").select().eq("request_id", request.id);
    expect(plans).toHaveLength(0);
  });

  it("creates a new plan version on manual edit without mutating the previous version", async () => {
    const request = await requestWithConfirmedSourceSet();
    const ai = new FakeAIProvider([VALID_PLAN]);
    const v1 = await generateContentPlan(owner.client, ai, "fake-model", request.id);

    const v2 = await saveManualContentPlan(
      owner.client,
      request.id,
      {
        title: "AI Agents in Recruiting (Updated)",
        primaryKeyword: v1.primary_keyword,
        secondaryKeywords: [],
        searchIntent: "informational",
        angle: "practical",
        sections: [{ heading: "Introduction", level: "h2", purpose: "intro", hasFactualClaims: true, evidenceIds: ["S1:E1"] }],
        ctaDirection: null,
        links: [],
        knownLimitations: null,
      },
      owner.userId
    );

    expect(v2.version_number).toBe(2);
    expect(v2.title).toBe("AI Agents in Recruiting (Updated)");

    const { data: v1Reloaded } = await admin.from("content_plans").select("title").eq("id", v1.id).single();
    expect(v1Reloaded?.title).toBe("AI Agents in Recruiting");
  });
});
