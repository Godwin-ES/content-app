import type { NextAction } from "@/lib/workspace/next-action";

/**
 * Surfaces exactly one primary next action (SYSTEM-DESIGN-NEXTJS.md §34,
 * Task 19 Step 1/2) so the Content Manager never has to infer what to do
 * next from a raw status string.
 */
export function RequestStepper({ nextAction }: { nextAction: NextAction }) {
  if (nextAction.key === "none") return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">Next step</p>
      <p className="font-medium">{nextAction.label}</p>
      <p className="text-sm text-muted-foreground">{nextAction.description}</p>
    </div>
  );
}
