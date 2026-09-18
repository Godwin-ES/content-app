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
import {
  createContentRequest,
  listOwnedRequests,
  setRequestPrimaryKeyword,
  setRequestCta,
  setSuppliedSourcesOnly,
} from "@/lib/repositories/requests";
import { getContentRequest } from "@/lib/repositories/requests";
import { listActivityEvents } from "@/lib/repositories/activity";
import { DEFAULT_REQUEST_SETTINGS } from "@/lib/domain/defaults";

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("content request intake (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];
  const originalModelSelection = process.env.ALLOW_MODEL_SELECTION;
  const originalProdModel = process.env.PRODUCTION_AI_MODEL;

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "intake-owner");
  });

  afterEach(() => {
    process.env.ALLOW_MODEL_SELECTION = originalModelSelection;
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
    expect(request.ai_model_choice).toBeNull();

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

  it("carries a supplied primary keyword and CTA through to the resolved columns", async () => {
    const request = await createContentRequest(owner.client, owner.userId, {
      topic: "AI agents in recruiting",
      primaryKeyword: "ai recruiting agents",
      cta: "Book a walkthrough",
    });
    requestIds.push(request.id);

    expect(request.supplied_primary_keyword).toBe("ai recruiting agents");
    expect(request.resolved_primary_keyword).toBe("ai recruiting agents");
    expect(request.supplied_cta).toBe("Book a walkthrough");
    expect(request.resolved_cta).toBe("Book a walkthrough");
  });

  it("leaves the keyword and CTA null when not supplied, so each is derived later", async () => {
    const request = await createContentRequest(owner.client, owner.userId, { topic: "AI agents in recruiting" });
    requestIds.push(request.id);

    expect(request.supplied_primary_keyword).toBeNull();
    expect(request.resolved_primary_keyword).toBeNull();
    expect(request.resolved_cta).toBeNull();
  });

  it("updates the keyword and CTA after intake, and clearing one hands it back to derivation", async () => {
    const request = await createContentRequest(owner.client, owner.userId, { topic: "AI agents in recruiting" });
    requestIds.push(request.id);

    await setRequestPrimaryKeyword(owner.client, request.id, "  ai recruiting agents  ");
    await setRequestCta(owner.client, request.id, "Book a walkthrough");

    const afterSet = await getContentRequest(owner.client, request.id);
    expect(afterSet?.supplied_primary_keyword).toBe("ai recruiting agents");
    expect(afterSet?.resolved_primary_keyword).toBe("ai recruiting agents");
    expect(afterSet?.resolved_cta).toBe("Book a walkthrough");

    await setRequestPrimaryKeyword(owner.client, request.id, null);
    const afterClear = await getContentRequest(owner.client, request.id);
    expect(afterClear?.supplied_primary_keyword).toBeNull();
    expect(afterClear?.resolved_primary_keyword).toBeNull();
    // The CTA is untouched by clearing the keyword.
    expect(afterClear?.resolved_cta).toBe("Book a walkthrough");

    const events = await listActivityEvents(owner.client, request.id);
    expect(events.some((e) => e.event_type === "primary_keyword_changed")).toBe(true);
    expect(events.some((e) => e.event_type === "cta_changed")).toBe(true);
  });

  it("actually persists supplied-sources-only — content_requests has no UPDATE policy, so a plain update writes nothing", async () => {
    const request = await createContentRequest(owner.client, owner.userId, { topic: "AI agents in recruiting" });
    requestIds.push(request.id);
    expect(request.supplied_sources_only).toBe(false);

    await setSuppliedSourcesOnly(owner.client, request.id, true);
    expect((await getContentRequest(owner.client, request.id))?.supplied_sources_only).toBe(true);

    await setSuppliedSourcesOnly(owner.client, request.id, false);
    expect((await getContentRequest(owner.client, request.id))?.supplied_sources_only).toBe(false);
  });

  it("refuses to change another owner's request settings", async () => {
    const request = await createContentRequest(owner.client, owner.userId, { topic: "AI agents in recruiting" });
    requestIds.push(request.id);

    const stranger = await createTestUser(admin, "intake-stranger");
    try {
      // The RPC is security definer, so it reads the row and refuses on
      // ownership rather than failing to find it.
      await expect(setRequestPrimaryKeyword(stranger.client, request.id, "hijacked")).rejects.toMatchObject({
        code: "PERMISSION_DENIED",
      });
      expect((await getContentRequest(owner.client, request.id))?.resolved_primary_keyword).toBeNull();
    } finally {
      await deleteTestUser(admin, stranger.userId);
    }
  });

  it("rejects a blank topic before touching the database", async () => {
    await expect(createContentRequest(owner.client, owner.userId, { topic: "   " })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("no longer takes source URLs at all — they are sources, not a request property", async () => {
    // Supplied URLs become research_sources rows with origin 'user_url' as
    // they are added, so they can be retried and excluded like any other
    // source. Passing them here is ignored rather than stored.
    const request = await createContentRequest(owner.client, owner.userId, {
      topic: "AI agents",
      sourceUrls: ["https://example.com/a"],
    });
    requestIds.push(request.id);
    expect(request).not.toHaveProperty("source_urls");
  });

  it("records the selected model only when the deployment allows choosing one", async () => {
    process.env.ALLOW_MODEL_SELECTION = "true";
    const request = await createContentRequest(owner.client, owner.userId, { topic: "Topic" }, "gemini");
    requestIds.push(request.id);
    expect(request.ai_model_choice).toBe("gemini");
  });

  it("rejects a client-supplied model choice when the deployment does not allow choosing", async () => {
    process.env.ALLOW_MODEL_SELECTION = "false";
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
