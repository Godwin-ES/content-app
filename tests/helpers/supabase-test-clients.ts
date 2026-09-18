import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function hasSupabaseCredentials(): boolean {
  return Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY);
}

export function createAdminClient(): SupabaseClient<Database> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase credentials. Set them in .env.local to run integration tests.");
  }
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates an ephemeral account and returns a signed-in client acting as it.
 * Integration tests are self-contained — they never depend on the seeded
 * accounts.
 *
 * There is no role to pass any more: every account is an owner of its own
 * work, so a test that needs two actors creates two accounts and relies on
 * ownership, which is what the application enforces.
 */
export async function createTestUser(
  admin: SupabaseClient<Database>,
  label: string
): Promise<{ client: SupabaseClient<Database>; userId: string; email: string }> {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error("Missing Supabase credentials. Set them in .env.local to run integration tests.");
  }
  const email = `${label}-${crypto.randomUUID()}@koya-content-studio.test`;
  const password = crypto.randomUUID();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw createError ?? new Error("Failed to create test user");
  }

  // The on_auth_user_created trigger (migration 020) already inserted a
  // profile; this only replaces the name it guessed with the test's label,
  // which is what assertions read.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ user_id: created.user.id, display_name: label, role: "owner" }, { onConflict: "user_id" });
  if (profileError) throw profileError;

  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { client, userId: created.user.id, email };
}

export async function deleteTestUser(admin: SupabaseClient<Database>, userId: string): Promise<void> {
  await admin.auth.admin.deleteUser(userId);
}
