"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createContentPackageAction } from "@/actions/packages";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PackageReadiness as PackageReadinessResult } from "@/lib/packages/service";
import { useAutoMode } from "@/components/requests/auto-mode-context";

interface PackageReadinessProps {
  requestId: string;
  readiness: PackageReadinessResult;
  canCreate: boolean;
}

/**
 * Explains exactly why a package can or cannot be created yet
 * (SYSTEM-DESIGN-NEXTJS.md §23 Step 2) — never just a disabled button with
 * no explanation.
 */
export function PackageReadiness({ requestId, readiness, canCreate }: PackageReadinessProps) {
  const [error, setError] = useState<string | null>(null);
  const { running: autoModeRunning } = useAutoMode();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createContentPackageAction(requestId);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-medium">Package Readiness</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {readiness.checks.map((check) => (
          <li key={check.key} className="flex items-center gap-2">
            <Badge variant={check.ok ? "outline" : "destructive"}>{check.ok ? "OK" : "Not ready"}</Badge>
            <span className={check.ok ? "text-muted-foreground" : ""}>{check.message}</span>
          </li>
        ))}
      </ul>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" size="sm" onClick={create} disabled={!readiness.ready || !canCreate || isPending || autoModeRunning} className="w-fit">
        {isPending ? "Creating package..." : "Create Package"}
      </Button>
    </div>
  );
}
