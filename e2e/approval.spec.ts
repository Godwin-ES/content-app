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

test("the owner approves their own package from the Package tab, in one act", async ({ page }) => {
  const { requestId, packageId } = await seedFullyReadyRequest(admin, owner.client, owner.userId, "E2E approval flow request");
  requestIds.push(requestId);

  await login(page, owner.email, owner.password);
  await page.goto(`/requests/${requestId}`);
  await page.getByRole("tab", { name: "Package" }).click();
  await page.getByRole("button", { name: "Approve for publishing" }).click();

  await expect(page.getByText("Approved. This package can be queued for publishing.")).toBeVisible({ timeout: 30000 });

  const { data: after } = await admin.from("content_requests").select("status").eq("id", requestId).single();
  expect(after?.status).toBe("approved");

  // The approval is recorded against the exact package, by the person who
  // made it — that record is the evidence the gate was honoured.
  const { data: approvals } = await admin.from("package_approvals").select().eq("request_id", requestId);
  expect(approvals).toHaveLength(1);
  expect(approvals![0].package_id).toBe(packageId);
  expect(approvals![0].approved_by).toBe(owner.userId);

  // It shows up under Published, not under some in-between state.
  await page.goto("/dashboard");
  await page.getByRole("tab", { name: /^Published/ }).click();
  await expect(page.getByText("E2E approval flow request")).toBeVisible({ timeout: 15000 });
});

test("deleting moves a request to the bin, and restoring brings it back", async ({ page }) => {
  const { requestId } = await seedFullyReadyRequest(admin, owner.client, owner.userId, "E2E bin request");
  requestIds.push(requestId);

  await login(page, owner.email, owner.password);
  await page.goto("/dashboard");

  const row = page.locator("div", { hasText: "E2E bin request" });
  await expect(row.first()).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Confirm delete" }).first().click();

  await expect
    .poll(
      async () => (await admin.from("content_requests").select("deleted_at").eq("id", requestId).single()).data?.deleted_at,
      { timeout: 15000 }
    )
    .not.toBeNull();

  // The bin says how long is left, and offers the way back.
  await page.getByRole("tab", { name: /^Deleted/ }).click();
  await expect(page.getByText("E2E bin request")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/days left to restore/)).toBeVisible();

  await page.getByRole("button", { name: "Restore" }).first().click();

  await expect
    .poll(
      async () => (await admin.from("content_requests").select("deleted_at").eq("id", requestId).single()).data?.deleted_at,
      { timeout: 15000 }
    )
    .toBeNull();
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
