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
 * Creates an ephemeral auth user + profile row and returns a signed-in
 * client acting as that user. Integration tests for Task 3 are self-contained
 * (they do not depend on the seeded demo accounts created in Task 22).
 */
export async function createTestUser(
  admin: SupabaseClient<Database>,
  role: "content_manager" | "reviewer",
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

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ user_id: created.user.id, display_name: label, role });
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
