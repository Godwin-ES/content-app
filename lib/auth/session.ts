import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCurrentUser, type CurrentUser } from "@/lib/auth/current-user";

/**
 * Next.js request-scoped wrappers around loadCurrentUser(), for Server
 * Components/layouts that need the signed-in user's session directly
 * (rather than an already-authenticated client, as guards.ts takes).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const currentUser = await loadCurrentUser(supabase);
  if (!currentUser) {
    // A valid Supabase Auth session with no matching profile row (e.g. the
    // profile was deleted directly in the database while the auth user
    // still exists) would otherwise loop forever: returning null here sends
    // the caller to /login, but a still-valid session would just look
    // authenticated again. A Server Component render can't clear the
    // session cookie itself, so route through a Route Handler that can.
    redirect("/auth/invalid-session");
  }

  return currentUser;
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
