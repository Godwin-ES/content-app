"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { APP_NAME } from "@/lib/domain/status";

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
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{APP_NAME}</CardTitle>
          <CardDescription>Sign in to continue to your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
