import { AlertTriangle } from "lucide-react";
import type { StaleNotice as StaleNoticeData } from "@/lib/workspace/staleness";

/**
 * Downstream work that no longer matches what it was generated from.
 * Deliberately advisory rather than blocking: the existing content is
 * still valid work and may still be what you want, so this states the
 * mismatch and the remedy without taking the decision away.
 */
export function StaleNotice({ notice }: { notice: StaleNoticeData | null }) {
  if (!notice) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/40">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <p className="text-amber-900 dark:text-amber-200">
        {notice.reason} <span className="font-medium">{notice.action}</span>
      </p>
    </div>
  );
}
