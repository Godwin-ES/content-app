import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { UserRole } from "@/lib/domain/types";

export interface CurrentUser {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
}

/**
 * Loads the current user's role from `profiles`, never trusting a role
 * claim from the browser (SYSTEM-DESIGN-NEXTJS.md §30.2). Framework-agnostic:
 * takes an already-authenticated Supabase client so it can be exercised
 * directly in integration tests without a Next.js request context.
 */
export async function loadCurrentUser(supabase: SupabaseClient<Database>): Promise<CurrentUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? "",
    displayName: profile.display_name,
    role: profile.role as UserRole,
  };
}
