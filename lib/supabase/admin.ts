import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Service-role client for trusted server-only writes that have no client RLS
 * policy at all (error_logs, notification_attempts, and the activity/operation
 * repositories' inserts) — see the RLS comments in
 * ../../supabase/migrations/007_rls_policies.sql. Never import this from
 * client code or expose the service role key to the browser.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
