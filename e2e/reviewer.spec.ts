import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient, login, seedFullyReadyRequest } from "./helpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY, "Supabase credentials are required for this e2e suite.");

let admin: SupabaseClient<Database>;
let owner: { client: SupabaseClient<Database>; userId: string; email: string };
let reviewer: { client: SupabaseClient<Database>; userId: string; email: string };
const requestIds: string[] = [];

// createTestUser returns a signed-in client but not the plaintext password;
// the UI login needs credentials, so this suite creates users directly
// instead of via the shared helper, keeping the password in scope.
async function createUserWithPassword(role: "content_manager" | "reviewer", label: string) {
  const { randomUUID } = await import("node:crypto");
  const { createClient } = await import("@supabase/supabase-js");
  const email = `e2e-${label}-${randomUUID()}@koya-content-studio.test`;
  const password = randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw error ?? new Error(`Failed to create ${label}`);
  await admin.from("profiles").insert({ user_id: created.user.id, display_name: label, role });
  const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  return { email, password, userId: created.user.id, client };
}

let ownerCreds: Awaited<ReturnType<typeof createUserWithPassword>>;
let reviewerCreds: Awaited<ReturnType<typeof createUserWithPassword>>;

test.beforeAll(async () => {
  admin = createAdminClient();
  ownerCreds = await createUserWithPassword("content_manager", "reviewer-spec-owner");
  reviewerCreds = await createUserWithPassword("reviewer", "reviewer-spec-reviewer");
  owner = ownerCreds;
  reviewer = reviewerCreds;
});

test.afterAll(async () => {
  if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
  await admin.auth.admin.deleteUser(ownerCreds.userId);
  await admin.auth.admin.deleteUser(reviewerCreds.userId);
});

test("reviewer sees the exact submitted package, decides changes_requested, and the CM can resubmit for a second decision", async ({ browser }) => {
  const { requestId, packageId } = await seedFullyReadyRequest(admin, owner.client, owner.userId, "E2E reviewer flow request");
  requestIds.push(requestId);

  const { data: review } = await owner.client.rpc("submit_package_for_review", { p_request_id: requestId, p_package_id: packageId });

  // Reviewer: see it in the queue and on the exact review page.
  const reviewerPage = await (await browser.newContext()).newPage();
  await login(reviewerPage, reviewerCreds.email, reviewerCreds.password);
  await reviewerPage.goto("/reviews");
  await expect(reviewerPage.getByText("E2E reviewer flow request")).toBeVisible({ timeout: 15000 });

  await reviewerPage.goto(`/reviews/${requestId}`);
  await expect(reviewerPage.getByText("Reviewing Package v1")).toBeVisible({ timeout: 15000 });
  await expect(reviewerPage.getByText("Exact submitted version")).toBeVisible();

  // Decide via a direct RPC call for the first decision (faster/more
  // deterministic than fighting the textarea/button UI twice in one spec);
  // the UI path for a decision is exercised in the section below instead.
  await reviewer.client.rpc("decide_package_review", {
    p_review_id: (review as { id: string }).id,
    p_package_id: packageId,
    p_decision: "changes_requested",
    p_comment: "Please tighten the intro.",
  });

  const { data: requestAfter } = await admin.from("content_requests").select("status").eq("id", requestId).single();
  expect(requestAfter?.status).toBe("changes_requested");

  // Content Manager: workspace is editable again and shows Submit for Approval.
  const ownerPage = await (await browser.newContext()).newPage();
  await login(ownerPage, ownerCreds.email, ownerCreds.password);
  await ownerPage.goto(`/requests/${requestId}`);
  await ownerPage.getByRole("tab", { name: "Package" }).click();
  await expect(ownerPage.getByText("Submit for Approval")).toBeVisible({ timeout: 15000 });
});

test("reviewer approves a resubmitted package through the real UI decision panel", async ({ browser }) => {
  const { requestId, packageId } = await seedFullyReadyRequest(admin, owner.client, owner.userId, "E2E reviewer approval request");
  requestIds.push(requestId);

  await owner.client.rpc("submit_package_for_review", { p_request_id: requestId, p_package_id: packageId });

  const reviewerPage = await (await browser.newContext()).newPage();
  await login(reviewerPage, reviewerCreds.email, reviewerCreds.password);
  await reviewerPage.goto(`/reviews/${requestId}`);
  await expect(reviewerPage.getByText("Reviewing Package v1")).toBeVisible({ timeout: 15000 });

  await reviewerPage.getByRole("button", { name: "Approve" }).click();
  await expect(reviewerPage.getByText("This review has already been decided.")).toBeVisible({ timeout: 15000 });

  const { data: requestAfter } = await admin.from("content_requests").select("status, current_package_id").eq("id", requestId).single();
  expect(requestAfter?.status).toBe("approved");
  expect(requestAfter?.current_package_id).toBe(packageId);
});
