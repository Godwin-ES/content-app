import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createAdminClient, login } from "./helpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_FAILURE_TOKEN = process.env.TEST_FAILURE_TOKEN;

test.skip(!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY, "Supabase credentials are required for this e2e suite.");
test.skip(!TEST_FAILURE_TOKEN, "TEST_FAILURE_TOKEN is required for the failure-injection gate tests.");
// This whole spec only exercises anything real outside production
// (SYSTEM-DESIGN-NEXTJS.md §39): against `pnpm build && pnpm start`,
// NODE_ENV=production unconditionally blocks the gate (by design — see
// BUILD-NOTES-NEXTJS.md), so these assertions are only meaningful when the
// webServer is `pnpm dev`, which is this project's Playwright default.
//
// The AI-provider-wrapper logic for each injected mode (immediate throw,
// schema-shaped malformed-output error, real ~6s delay, failed retrieval
// outcome) is unit-tested directly against a stubbed `server-only` guard
// in tests/unit/test-support/injected-providers.test.ts — Playwright has
// no equivalent stub, so importing that server-only module here would
// throw "This module cannot be imported from a Client Component module."
// This spec instead covers what only a real browser/HTTP round trip can:
// the gate itself, and that a UI page correctly renders a known partial-
// failure state.

let admin: SupabaseClient<Database>;
let owner: { email: string; password: string; userId: string; client: SupabaseClient<Database> };
const requestIds: string[] = [];

test.beforeAll(async () => {
  admin = createAdminClient();
  const email = `e2e-failure-owner-${randomUUID()}@koya-content-studio.test`;
  const password = randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw error ?? new Error("Failed to create owner");
  await admin
    .from("profiles")
    .upsert({ user_id: created.user.id, display_name: "Failure Recovery Owner", role: "owner" }, { onConflict: "user_id" });
  const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  owner = { email, password, userId: created.user.id, client };
});

test.afterAll(async () => {
  if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
  await admin.auth.admin.deleteUser(owner.userId);
});

test.afterEach(async ({ request }) => {
  await request.delete("/api/test/failure-mode", { headers: { "x-koya-test-token": TEST_FAILURE_TOKEN! } });
});

test("the failure-mode gate rejects every unauthorized combination and accepts the fully-authorized one", async ({ request }) => {
  const noToken = await request.post("/api/test/failure-mode", { data: { mode: "ai_generation_timeout" } });
  expect(noToken.status()).toBe(404);

  const wrongToken = await request.post("/api/test/failure-mode", {
    headers: { "x-koya-test-token": "definitely-wrong" },
    data: { mode: "ai_generation_timeout" },
  });
  expect(wrongToken.status()).toBe(404);

  const invalidMode = await request.post("/api/test/failure-mode", {
    headers: { "x-koya-test-token": TEST_FAILURE_TOKEN! },
    data: { mode: "not-a-real-mode" },
  });
  expect(invalidMode.status()).toBe(400);

  const valid = await request.post("/api/test/failure-mode", {
    headers: { "x-koya-test-token": TEST_FAILURE_TOKEN! },
    data: { mode: "ai_generation_timeout" },
  });
  expect(valid.status()).toBe(200);
  expect(await valid.json()).toMatchObject({ ok: true, mode: "ai_generation_timeout" });

  const get = await request.get("/api/test/failure-mode", { headers: { "x-koya-test-token": TEST_FAILURE_TOKEN! } });
  expect((await get.json()).mode).toBe("ai_generation_timeout");
});

test("the injected mode persists across separate requests until explicitly cleared", async ({ request }) => {
  await request.post("/api/test/failure-mode", {
    headers: { "x-koya-test-token": TEST_FAILURE_TOKEN! },
    data: { mode: "notification_failure" },
  });

  // A second, independent request (same cookie jar within this context)
  // still sees it — this is exactly what a real request handler picking
  // up the cookie mid-workflow would see.
  const second = await request.get("/api/test/failure-mode", { headers: { "x-koya-test-token": TEST_FAILURE_TOKEN! } });
  expect((await second.json()).mode).toBe("notification_failure");

  await request.delete("/api/test/failure-mode", { headers: { "x-koya-test-token": TEST_FAILURE_TOKEN! } });
  const third = await request.get("/api/test/failure-mode", { headers: { "x-koya-test-token": TEST_FAILURE_TOKEN! } });
  expect((await third.json()).mode).toBeNull();
});

test("a partial article-generation failure state renders correctly: two succeeded options visible, one failed and retryable", async ({ page }) => {
  const { data: request } = await admin
    .from("content_requests")
    .insert({
      owner_id: owner.userId,
      topic: "E2E failure recovery request",
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
  const { data: plan } = await admin
    .from("content_plans")
    .insert({
      request_id: request!.id,
      source_set_version_id: sourceSet!.id,
      version_number: 1,
      primary_keyword: "ai agents in recruiting",
      title: "AI Agents in Recruiting",
      sections: [{ heading: "Intro", level: "h2", purpose: "intro", hasFactualClaims: true, evidenceIds: ["S1:E1"] }],
    })
    .select()
    .single();
  await admin.from("content_requests").update({ current_plan_id: plan!.id }).eq("id", request!.id);

  // Two succeeded options (A, C) and one failed generation attempt (B) —
  // exactly the state generateArticleOptions would leave behind after a
  // partial failure (tests/integration/article-generation.test.ts covers
  // producing this state through the real pipeline); seeded directly here
  // so this spec can focus on what only a real browser can confirm: the
  // page renders it correctly.
  const validArticle = (title: string) => ({
    insufficientEvidence: false,
    insufficientEvidenceReason: null,
    title,
    metaDescription: "meta",
    primaryKeyword: "ai agents in recruiting",
    secondaryKeywords: [],
    sections: [{ heading: "Overview", level: "h2", bodyMarkdown: "Some teams reported reduced workload." }],
    links: [],
    claims: [],
  });

  for (const slot of ["A", "C"] as const) {
    const { data: artifact } = await admin
      .from("content_artifacts")
      .insert({ request_id: request!.id, kind: "article", slot })
      .select()
      .single();
    await owner.client.rpc("create_artifact_version", {
      p_artifact_id: artifact!.id,
      p_change_type: "initial_generation",
      p_content: validArticle(`Option ${slot}`) as Json,
      p_content_hash: `hash-${slot}`,
      p_source_set_version_id: sourceSet!.id,
    });
  }
  // Slot B: artifact exists but generation failed, so it has no version.
  await admin.from("content_artifacts").insert({ request_id: request!.id, kind: "article", slot: "B" });

  await login(page, owner.email, owner.password);
  await page.goto(`/requests/${request!.id}`);
  await page.getByRole("tab", { name: "Articles" }).click();
  // Each option is its own sub-tab (Phase 4 of the post-Task-22 UX pass);
  // the failed one's badge shows right on its tab trigger, but seeing its
  // Retry button (and the other two options' "Generated" state) requires
  // switching into each tab in turn.
  await expect(page.getByRole("tab", { name: /Option B/ }).getByText("Failed")).toBeVisible({ timeout: 15000 });
  await page.getByRole("tab", { name: /Option B/ }).click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();

  for (const slot of ["A", "C"]) {
    await page.getByRole("tab", { name: new RegExp(`Option ${slot}`) }).click();
    await expect(page.getByText("Generated", { exact: true })).toBeVisible();
  }
});
