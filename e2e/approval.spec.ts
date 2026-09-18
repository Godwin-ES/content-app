import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient, createUserWithPassword, login, seedFullyReadyRequest } from "./helpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY, "Supabase credentials are required for this e2e suite.");

let admin: SupabaseClient<Database>;
let owner: Awaited<ReturnType<typeof createUserWithPassword>>;
const requestIds: string[] = [];

test.beforeAll(async () => {
  admin = createAdminClient();
  owner = await createUserWithPassword(admin, "approval-spec-owner");
});

test.afterAll(async () => {
  if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
  await admin.auth.admin.deleteUser(owner.userId);
});

test("the owner records changes needed, edits, and then approves through the Package tab", async ({ page }) => {
  // Two full decisions, each several hosted-Supabase round trips plus a
  // best-effort Discord post — comfortably past the 30s default.
  test.setTimeout(120_000);

  const { requestId } = await seedFullyReadyRequest(admin, owner.client, owner.userId, "E2E approval flow request");
  requestIds.push(requestId);

  await login(page, owner.email, owner.password);
  await page.goto(`/requests/${requestId}`);
  await page.getByRole("tab", { name: "Package" }).click();

  // Asking for changes needs a reason, and says so by keeping the button
  // disabled until there is one.
  await page.getByRole("button", { name: "Note changes needed" }).click();
  await page.fill("#review-comment", "Please tighten the intro.");
  await page.getByRole("button", { name: "Save changes needed" }).click();

  await expect
    .poll(async () => (await admin.from("content_requests").select("status").eq("id", requestId).single()).data?.status, {
      timeout: 15000,
    })
    .toBe("changes_requested");

  // The same tab now approves it — no second account, no handover.
  await page.reload();
  await page.getByRole("tab", { name: "Package" }).click();
  await page.getByRole("button", { name: "Approve for publishing" }).click();

  await expect(page.getByText("Approved. This package can be queued for publishing.")).toBeVisible({ timeout: 15000 });

  const { data: after } = await admin.from("content_requests").select("status").eq("id", requestId).single();
  expect(after?.status).toBe("approved");

  // The decision is recorded against the exact package, by the person who
  // made it — that record is the evidence the approval gate was honoured.
  const { data: reviews } = await admin.from("approval_reviews").select().eq("request_id", requestId).eq("status", "approved");
  expect(reviews).toHaveLength(1);
  expect(reviews![0].decided_by).toBe(owner.userId);
  expect(reviews![0].decided_at).not.toBeNull();
});

test("another account cannot open someone else's request", async () => {
  const { requestId } = await seedFullyReadyRequest(admin, owner.client, owner.userId, "E2E isolation request");
  requestIds.push(requestId);

  const stranger = await createUserWithPassword(admin, "approval-spec-stranger");
  try {
    const { data } = await stranger.client.from("content_requests").select("id").eq("id", requestId);
    expect(data).toHaveLength(0);
  } finally {
    await admin.auth.admin.deleteUser(stranger.userId);
  }
});
