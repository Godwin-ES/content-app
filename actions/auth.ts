"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/domain/errors";

export async function signIn(
  _prevState: ActionResult<null> | null,
  formData: FormData
): Promise<ActionResult<null>> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", stage: "sign_in", message: "Enter both an email and a password.", retrySafe: true },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      ok: false,
      error: { code: "PERMISSION_DENIED", stage: "sign_in", message: "Incorrect email or password.", retrySafe: true },
    };
  }

  // Route through `/`, which already owns the role -> landing-page mapping.
  // Redirecting straight to /dashboard sent Reviewers to the Content
  // Manager's dashboard on every sign-in: that page only requires *a*
  // session, not the content_manager role, so they landed on an empty
  // request list with a "New content request" button they cannot use.
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
