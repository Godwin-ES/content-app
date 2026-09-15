import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface OperationErrorProps {
  what: string;
  safe?: string;
  action?: ReactNode;
}

/**
 * Every failure answers three questions (SYSTEM-DESIGN-NEXTJS.md §26.1):
 * what failed, what work is still safe, what the user can do next. Used
 * anywhere a partial or full failure needs to be shown as more than a bare
 * error string.
 */
export function OperationError({ what, safe, action }: OperationErrorProps) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <p>{what}</p>
        {safe ? <p className="mt-1 text-muted-foreground">{safe}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </AlertDescription>
    </Alert>
  );
}
