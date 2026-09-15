import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Reusable empty state for every non-happy "there's nothing here yet"
 * moment (SYSTEM-DESIGN-NEXTJS.md §34, Task 19 Step 4) — explains what's
 * missing and, where applicable, what to do about it, rather than showing
 * a bare blank section.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
