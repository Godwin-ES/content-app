"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { signIn } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthCard, AuthDivider } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";

function InvalidSessionNotice() {
  const reason = useSearchParams().get("reason");
  if (reason !== "invalid_session") return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>Your session is no longer valid. Please sign in again.</AlertDescription>
    </Alert>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <InvalidSessionNotice />
      </Suspense>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Sign in" description="Continue to your workspace.">
      <div className="flex flex-col gap-4">
        <GoogleButton />
        <AuthDivider />
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <Link href="/signup" className="underline">
            Create one
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
