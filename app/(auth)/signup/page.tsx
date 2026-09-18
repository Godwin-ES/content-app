"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { signUp } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthCard, AuthDivider } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";

/**
 * Signing up is the whole of onboarding. There is nothing to assign and
 * nobody to invite: the account that signs up owns its own requests,
 * approves its own packages, and publishes its own content.
 */
export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUp, null);

  return (
    <AuthCard title="Create your account" description="Research, write, approve and publish — from one workspace.">
      <div className="flex flex-col gap-4">
        <GoogleButton label="Sign up with Google" />
        <AuthDivider />

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Name</Label>
            <Input id="displayName" name="displayName" autoComplete="name" placeholder="Optional" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
            <p className="text-sm text-muted-foreground">At least 8 characters.</p>
          </div>

          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={pending} className="mt-2">
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Creating account...
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
