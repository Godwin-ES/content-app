/**
 * Seeds the dedicated manual-test accounts from environment-only
 * credentials — never hard-coded, never committed. Idempotent: safe to run
 * repeatedly; an existing user with a matching email is left alone rather
 * than duplicated.
 *
 * These used to be a Content Manager and a Reviewer, two halves of one
 * workflow. With one role they are simply two independent accounts, each
 * owning its own work — the second one is still worth having, because
 * "account B cannot see account A's request" is the isolation guarantee
 * every RLS policy now rests on.
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
  displayName: string
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

  // The on_auth_user_created trigger creates the profile for any account
  // made after migration 020; this makes the script safe either way and
  // pins the display name.
  await admin
    .from("profiles")
    .upsert({ user_id: userId, display_name: displayName, role: "owner" }, { onConflict: "user_id" });
  console.log(`Profile ready for ${email}`);
}

async function main() {
  const admin = createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await ensureUser(admin, requireEnv("TEST_CONTENT_MANAGER_EMAIL"), requireEnv("TEST_CONTENT_MANAGER_PASSWORD"), "Charles Morris");
  await ensureUser(admin, requireEnv("TEST_REVIEWER_EMAIL"), requireEnv("TEST_REVIEWER_PASSWORD"), "Carl Richards");

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
