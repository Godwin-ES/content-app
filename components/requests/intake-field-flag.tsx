"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IntakeFlag } from "@/lib/domain/intake-checks";

/**
 * What a check thinks is wrong with one field, above that field.
 *
 * Dismissible unless blocking, and that is the point rather than a
 * concession. Every advisory flag here is a guess about subject matter the
 * app does not know: a coinage, an internal audience name, a deliberately
 * terse tone. The writer knows and the checker does not, so the checker
 * says its piece and gets out of the way.
 *
 * A blocking flag has no dismiss, because it is not a matter of taste —
 * a keyword containing a comma can never be found in a title, so letting
 * it through only moves the failure somewhere less obvious.
 */
export function IntakeFieldFlag({ flag, onDismiss }: { flag: IntakeFlag; onDismiss: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm dark:border-amber-500/30">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <p className="min-w-0 flex-1 text-amber-900 dark:text-amber-200">{flag.message}</p>
      {flag.blocking ? null : (
        <Button type="button" variant="ghost" size="sm" className="h-auto shrink-0 px-2 py-1" onClick={onDismiss}>
          Use it anyway
        </Button>
      )}
    </div>
  );
}
