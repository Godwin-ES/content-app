/**
 * Seeds the two dedicated E2E/manual-test accounts (Task 22 Step 1) from
 * environment-only credentials — never hard-coded, never committed.
 * Idempotent: safe to run repeatedly; an existing user with a matching
 * email is left alone rather than duplicated.
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * TEST_CONTENT_MANAGER_EMAIL, TEST_CONTENT_MANAGER_PASSWORD,
 * TEST_REVIEWER_EMAIL, TEST_REVIEWER_PASSWORD.
 *
 * Usage: pnpm tsx scripts/seed-test-users.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/database.types";

config({ path: path.resolve(__dirname, "..", ".env.local"), quiet: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Set it in .env.local before running this script.`);
  }
  return value;
}

async function ensureUser(
  admin: SupabaseClient<Database>,
  email: string,
  password: string,
  displayName: string,
  role: "content_manager" | "reviewer"
): Promise<void> {
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listError) throw listError;
  const existing = existingUsers.users.find((u) => u.email === email);

  let userId: string;
  if (existing) {
    userId = existing.id;
    console.log(`User already exists: ${email} (${userId})`);
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) throw createError ?? new Error(`Failed to create user ${email}`);
    userId = created.user.id;
    console.log(`Created user: ${email} (${userId})`);
  }

  const { data: existingProfile } = await admin.from("profiles").select().eq("user_id", userId).maybeSingle();
  if (existingProfile) {
    if (existingProfile.role !== role) {
      await admin.from("profiles").update({ role }).eq("user_id", userId);
      console.log(`Updated role for ${email} to ${role}`);
    }
  } else {
    await admin.from("profiles").insert({ user_id: userId, display_name: displayName, role });
    console.log(`Created profile for ${email} (${role})`);
  }
}

async function main() {
  const admin = createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await ensureUser(
    admin,
    requireEnv("TEST_CONTENT_MANAGER_EMAIL"),
    requireEnv("TEST_CONTENT_MANAGER_PASSWORD"),
    "Charles Morris",
    "content_manager"
  );
  await ensureUser(admin, requireEnv("TEST_REVIEWER_EMAIL"), requireEnv("TEST_REVIEWER_PASSWORD"), "Carl Richards", "reviewer");

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
