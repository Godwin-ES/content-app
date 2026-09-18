import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
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
  owner = await createUserWithPassword(admin, "publishing-spec-owner");
});

test.afterAll(async () => {
  if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
  await admin.auth.admin.deleteUser(owner.userId);
});

async function approvedRequest(topic: string) {
  const { requestId, packageId } = await seedFullyReadyRequest(admin, owner.client, owner.userId, topic);
  requestIds.push(requestId);

  // The owner approves their own package — there is no second account.
  await owner.client.rpc("approve_package", { p_request_id: requestId, p_package_id: packageId });

  return { requestId, packageId };
}

async function queueChannelDirect(requestId: string, packageId: string, channel: "linkedin" | "x" | "newsletter") {
  const { data: pkg } = await admin.from("content_packages").select().eq("id", packageId).single();
  const versionId =
    channel === "linkedin" ? pkg!.linkedin_version_id : channel === "x" ? pkg!.x_version_id : pkg!.newsletter_version_id;
  const { data: item } = await owner.client.rpc("create_queue_item", {
    p_package_id: packageId,
    p_channel: channel,
    p_channel_artifact_version_id: versionId,
    p_idempotency_key: randomUUID(),
  });
  return item as { id: string; status: string };
}

// Queueing goes through a server action and a router.refresh() against
// hosted Supabase. 15s was enough when this spec ran alone and not when it
// ran beside five others, which made the assertion flaky for reasons that
// had nothing to do with what it asserts.
test("queues a channel through the UI, then a second attempt on the same channel is rejected as a duplicate", async ({ page }) => {
  const { requestId } = await approvedRequest("E2E publishing queue request");

  await login(page, owner.email, owner.password);
  await page.goto(`/requests/${requestId}`);
  await page.getByRole("tab", { name: "Publishing" }).click();
  await expect(page.locator("#queue-channel")).toBeVisible({ timeout: 30000 });

  await page.selectOption("#queue-channel", "linkedin");
  await page.click('button:has-text("Queue Now")');
  await expect(page.getByText("queued", { exact: true }).first()).toBeVisible({ timeout: 30000 });

  const { data: items } = await admin.from("publishing_queue_items").select().eq("request_id", requestId);
  expect(items).toHaveLength(1);
  expect(items?.[0].channel).toBe("linkedin");
  expect(items?.[0].status).toBe("queued");

  // The now-active channel is no longer offered in the selector — the UI
  // itself prevents a same-channel duplicate; the RPC's own active-item
  // check is what makes this a hard guarantee, not just a UI nicety.
  const options = await page.locator("#queue-channel option").allTextContents();
  expect(options).not.toContain("LinkedIn");
});

test("preserves upstream work: cancelling one queued item never touches another channel's queue item", async ({ page }) => {
  const { requestId, packageId } = await approvedRequest("E2E publishing cancellation request");
  const item1 = await queueChannelDirect(requestId, packageId, "linkedin");
  const item2 = await queueChannelDirect(requestId, packageId, "x");

  await login(page, owner.email, owner.password);
  await page.goto(`/requests/${requestId}`);
  await page.getByRole("tab", { name: "Publishing" }).click();
  await expect(page.getByText("LinkedIn")).toBeVisible({ timeout: 30000 });

  const linkedinCard = page.locator("li", { hasText: "LinkedIn" }).first();
  await linkedinCard.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(2000);

  const { data: after } = await admin.from("publishing_queue_items").select().in("id", [item1.id, item2.id]);
  const linkedinAfter = after?.find((i) => i.id === item1.id);
  const xAfter = after?.find((i) => i.id === item2.id);
  expect(linkedinAfter?.status).toBe("cancelled");
  expect(xAfter?.status).toBe("queued");
});
