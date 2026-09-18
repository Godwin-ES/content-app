import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { loadCurrentUser, type CurrentUser } from "@/lib/auth/current-user";

/**
 * Server actions call this instead of trusting anything the client says
 * about who is asking. Deliberately framework-agnostic (it takes an
 * already-authenticated Supabase client) so integration tests can exercise
 * the exact permission boundary without a Next.js request context.
 *
 * Being signed in is all this establishes. Whether the signed-in person may
 * touch a particular request is decided by ownership, in RLS and in the
 * RPCs, not here — there is no role left to check.
 */
export async function requireSignedIn(supabase: SupabaseClient<Database>): Promise<CurrentUser> {
  const user = await loadCurrentUser(supabase);
  if (!user) {
    throw new DomainError("PERMISSION_DENIED", "auth", "You must be signed in to do that.");
  }
  return user;
}
