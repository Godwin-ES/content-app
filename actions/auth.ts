"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/domain/errors";

function credentials(formData: FormData): { email: string; password: string } {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

function validationError(message: string): ActionResult<null> {
  return { ok: false, error: { code: "VALIDATION_ERROR", stage: "sign_in", message, retrySafe: true } };
}

export async function signIn(_prevState: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const { email, password } = credentials(formData);
  if (!email || !password) return validationError("Enter both an email and a password.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      ok: false,
      error: { code: "PERMISSION_DENIED", stage: "sign_in", message: "Incorrect email or password.", retrySafe: true },
    };
  }

  redirect("/dashboard");
}

/**
 * Creates the account. The profile row is created by the
 * `on_auth_user_created` trigger (migration 020) rather than here, so an
 * account made any other way — Google, an invite link, the Supabase
 * dashboard — gets one too. Without it, a valid session with no profile
 * would land on /auth/invalid-session, which is a confusing first
 * impression for someone who just signed up successfully.
 */
export async function signUp(_prevState: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const { email, password } = credentials(formData);
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password) return validationError("Enter both an email and a password.");
  if (password.length < 8) return validationError("Use a password of at least 8 characters.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: displayName ? { display_name: displayName } : undefined },
  });

  if (error) {
    return { ok: false, error: { code: "VALIDATION_ERROR", stage: "sign_up", message: error.message, retrySafe: true } };
  }

  // With email confirmation switched on, signUp returns a user but no
  // session. Saying "check your email" is the honest response; redirecting
  // to the dashboard would bounce straight back to /login.
  if (!data.session) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        stage: "sign_up",
        message: "Account created. Check your email for a confirmation link, then sign in.",
        retrySafe: false,
      },
    };
  }

  redirect("/dashboard");
}

/**
 * Hands off to Google and comes back through /auth/callback, which
 * exchanges the code for a session.
 *
 * This needs the Google provider enabled on the Supabase project with a
 * client ID and secret — it cannot be configured from the codebase. Until
 * it is, Supabase returns a "provider is not enabled" error, which is
 * surfaced rather than swallowed so the cause is obvious.
 */
export async function signInWithGoogle(): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const origin = process.env.APP_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=/dashboard` },
  });

  if (error || !data.url) {
    return {
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        stage: "sign_in",
        message: error?.message ?? "Could not start Google sign-in.",
        retrySafe: true,
      },
    };
  }

  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
