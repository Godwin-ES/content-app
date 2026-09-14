import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { loadCurrentUser, type CurrentUser } from "@/lib/auth/current-user";

/**
 * Server actions call these instead of trusting any client-supplied role.
 * Deliberately framework-agnostic (accepts an already-authenticated
 * Supabase client) so integration tests can exercise the exact permission
 * boundary without a Next.js request context.
 */
export async function requireContentManager(supabase: SupabaseClient<Database>): Promise<CurrentUser> {
  const user = await loadCurrentUser(supabase);
  if (!user) {
    throw new DomainError("PERMISSION_DENIED", "auth", "You must be signed in to do that.");
  }
  if (user.role !== "content_manager") {
    throw new DomainError("PERMISSION_DENIED", "auth", "This action requires the Content Manager role.");
  }
  return user;
}

export async function requireReviewer(supabase: SupabaseClient<Database>): Promise<CurrentUser> {
  const user = await loadCurrentUser(supabase);
  if (!user) {
    throw new DomainError("PERMISSION_DENIED", "auth", "You must be signed in to do that.");
  }
  if (user.role !== "reviewer") {
    throw new DomainError("PERMISSION_DENIED", "auth", "This action requires the Reviewer role.");
  }
  return user;
}
