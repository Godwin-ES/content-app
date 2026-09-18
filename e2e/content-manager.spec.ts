import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.skip(!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY, "Supabase credentials are required for this e2e suite.");

let admin: SupabaseClient<Database>;
let ownerEmail: string;
let ownerPassword: string;
let ownerUserId: string;
const requestIds: string[] = [];

test.beforeAll(async () => {
  admin = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  ownerEmail = `e2e-content-manager-${randomUUID()}@koya-content-studio.test`;
  ownerPassword = randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({ email: ownerEmail, password: ownerPassword, email_confirm: true });
  if (error || !created.user) throw error ?? new Error("Failed to create e2e test user");
  ownerUserId = created.user.id;
  await admin
    .from("profiles")
    .upsert({ user_id: ownerUserId, display_name: "E2E Owner", role: "owner" }, { onConflict: "user_id" });
});

test.afterAll(async () => {
  if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
  if (ownerUserId) await admin.auth.admin.deleteUser(ownerUserId);
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", ownerEmail);
  await page.fill("#password", ownerPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}

test("dashboard shows an empty state before any request exists", async ({ page }) => {
  await login(page);
  // The dashboard groups by stage now, so the empty state belongs to the
  // tab that opens first rather than to the page as a whole.
  await expect(page.getByRole("tab", { name: /In Progress/ })).toBeVisible();
  await expect(page.getByText(/nothing in progress/i)).toBeVisible();
});

test("a new request lands in the workspace showing the Overview tab and a next-step stepper", async ({ page }) => {
  const { data: request } = await admin
    .from("content_requests")
    .insert({
      owner_id: ownerUserId,
      topic: "E2E workspace request",
      resolved_audience: "HR leaders",
      resolved_objective: "Educate",
      resolved_tone: "Professional",
      status: "draft",
    })
    .select()
    .single();
  requestIds.push(request!.id);

  await login(page);
  await page.goto(`/requests/${request!.id}`);

  await expect(page.getByText("E2E workspace request")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Research" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Plan" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Articles" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Channels" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Package" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Publishing" })).toBeVisible();
  // Activity is no longer a tab — it lives on the Overview as collapsible history.
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Show activity/ })).toBeVisible();

  await expect(page.getByText("Next step")).toBeVisible();
  await expect(page.getByText("Research: Start content research")).toBeVisible();
});

test("switching tabs reveals each section's own empty state", async ({ page }) => {
  const { data: request } = await admin
    .from("content_requests")
    .insert({
      owner_id: ownerUserId,
      topic: "E2E tab-switching request",
      resolved_audience: "HR leaders",
      resolved_objective: "Educate",
      resolved_tone: "Professional",
      status: "content_development",
    })
    .select()
    .single();
  requestIds.push(request!.id);

  await login(page);
  await page.goto(`/requests/${request!.id}`);

  await page.getByRole("tab", { name: "Channels" }).click();
  await expect(page.getByText("Select an article first")).toBeVisible();

  await page.getByRole("tab", { name: "Package" }).click();
  await expect(page.getByText("No package yet")).toBeVisible();

  await page.getByRole("tab", { name: "Publishing" }).click();
  await expect(page.getByText("No approved package yet")).toBeVisible();

  // Seeded straight into the database, so it has no recorded history —
  // the activity section should say so rather than render an empty list.
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("button", { name: /Show activity/ }).click();
  await expect(page.getByText(/nothing has happened on this request yet/i)).toBeVisible();
});

test("a submitted request shows that the decision is the next step", async ({ page }) => {
  const { data: request } = await admin
    .from("content_requests")
    .insert({
      owner_id: ownerUserId,
      topic: "E2E pending approval request",
      resolved_audience: "HR leaders",
      resolved_objective: "Educate",
      resolved_tone: "Professional",
      status: "pending_approval",
      selected_article_version_id: null,
    })
    .select()
    .single();
  requestIds.push(request!.id);

  await login(page);
  await page.goto(`/requests/${request!.id}`);
  await expect(page.getByText("Package: Decide on the submitted package")).toBeVisible();
});
