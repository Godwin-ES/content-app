// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  hasSupabaseCredentials,
} from "@/tests/helpers/supabase-test-clients";
import { createContentRequest, listOwnedRequests } from "@/lib/repositories/requests";
import { listActivityEvents } from "@/lib/repositories/activity";
import { DEFAULT_REQUEST_SETTINGS } from "@/lib/domain/defaults";

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("content request intake (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];
  const originalTestMode = process.env.ENABLE_AI_TEST_MODE;
  const originalProdModel = process.env.PRODUCTION_AI_MODEL;

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "intake-owner");
  });

  afterEach(() => {
    process.env.ENABLE_AI_TEST_MODE = originalTestMode;
    process.env.PRODUCTION_AI_MODEL = originalProdModel;
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  it("persists a topic-only request with resolved defaults, stays draft, and records activity", async () => {
    const request = await createContentRequest(owner.client, owner.userId, { topic: "  AI agents in recruiting  " });
    requestIds.push(request.id);

    expect(request.topic).toBe("AI agents in recruiting");
    expect(request.status).toBe("draft");
    expect(request.supplied_audience).toBeNull();
    expect(request.resolved_audience).toBe(DEFAULT_REQUEST_SETTINGS.audience);
    expect(request.resolved_objective).toBe(DEFAULT_REQUEST_SETTINGS.objective);
    expect(request.resolved_tone).toBe(DEFAULT_REQUEST_SETTINGS.tone);
    expect(request.test_model_choice).toBeNull();

    const events = await listActivityEvents(owner.client, request.id);
    expect(events.some((e) => e.event_type === "request_created")).toBe(true);
  });

  it("keeps supplied values distinguishable from resolved defaults when partially filled", async () => {
    const request = await createContentRequest(owner.client, owner.userId, {
      topic: "AI agents in recruiting",
      audience: "HR leaders",
    });
    requestIds.push(request.id);

    expect(request.supplied_audience).toBe("HR leaders");
    expect(request.resolved_audience).toBe("HR leaders");
    expect(request.supplied_objective).toBeNull();
    expect(request.resolved_objective).toBe(DEFAULT_REQUEST_SETTINGS.objective);
  });

  it("rejects a blank topic before touching the database", async () => {
    await expect(createContentRequest(owner.client, owner.userId, { topic: "   " })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects an invalid source URL", async () => {
    await expect(
      createContentRequest(owner.client, owner.userId, { topic: "AI agents", sourceUrls: ["not-a-url"] })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("records the selected test model only when AI test mode is enabled", async () => {
    process.env.ENABLE_AI_TEST_MODE = "true";
    const request = await createContentRequest(owner.client, owner.userId, { topic: "Topic" }, "gemini");
    requestIds.push(request.id);
    expect(request.test_model_choice).toBe("gemini");
  });

  it("rejects a client-supplied model choice when AI test mode is disabled", async () => {
    process.env.ENABLE_AI_TEST_MODE = "false";
    process.env.PRODUCTION_AI_MODEL = "claude_sonnet_5";

    await expect(
      createContentRequest(owner.client, owner.userId, { topic: "Topic" }, "gemini")
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns every owned request, including one still at draft", async () => {
    // A draft used to be dropped from the dashboard entirely, so this
    // covers the plain case as much as the status-change one.
    const draft = await createContentRequest(owner.client, owner.userId, { topic: "Draft request" });
    requestIds.push(draft.id);

    const withDraft = await listOwnedRequests(owner.client, owner.userId);
    expect(withDraft.some((r) => r.id === draft.id && r.status === "draft")).toBe(true);

    await admin.from("content_requests").update({ status: "source_review" }).eq("id", draft.id);

    const afterChange = await listOwnedRequests(owner.client, owner.userId);
    expect(afterChange.find((r) => r.id === draft.id)?.status).toBe("source_review");
  });
});
