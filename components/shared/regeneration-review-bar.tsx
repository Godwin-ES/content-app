"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Accept or undo one AI regeneration, in place.
 *
 * A manual edit has always had its own Save/Cancel, so the change could be
 * judged before it stuck. A regeneration replaced the draft outright, and
 * the only way back was Discard — which throws away every other unsaved
 * edit too. This gives a regeneration the same reviewable moment: keep it
 * and it folds into the draft like any other change, undo it and the draft
 * returns to exactly what it was a moment ago.
 *
 * Neither choice touches the database; saving a version is still separate
 * and still explicit.
 */
export function RegenerationReviewBar({
  what,
  onKeep,
  onUndo,
  disabled = false,
}: {
  /** What was regenerated, e.g. "this section" or "the subject". */
  what: string;
  onKeep: () => void;
  onUndo: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-3">
      <Sparkles aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <p className="flex-1 text-sm text-muted-foreground">Reviewing the regenerated {what}. Keep it, or undo to go back.</p>
      <Button type="button" variant="ghost" size="sm" onClick={onUndo} disabled={disabled}>
        Undo
      </Button>
      <Button type="button" size="sm" onClick={onKeep} disabled={disabled}>
        Keep
      </Button>
    </div>
  );
}
