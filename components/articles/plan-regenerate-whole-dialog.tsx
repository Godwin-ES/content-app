"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { regenerateWholePlanDraftAction } from "@/actions/planning";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ManualContentPlanInput } from "@/lib/planning/service";

interface PlanRegenerateWholeDialogProps {
  requestId: string;
  onRegenerated: (plan: ManualContentPlanInput) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Regenerates the entire plan as a fresh draft (Phase 3 of the
 * post-Task-22 UX pass) — like a section regeneration, nothing is saved
 * until "Save Version".
 */
export function PlanRegenerateWholeDialog({ requestId, onRegenerated, disabled = false, onBusyChange }: PlanRegenerateWholeDialogProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerate() {
    setPending(true);
    setError(null);
    onBusyChange?.(true);
    const result = await regenerateWholePlanDraftAction(requestId, instruction.trim() || null);
    setPending(false);
    onBusyChange?.(false);
    if (result.ok) {
      onRegenerated(result.data);
      setOpen(false);
      setInstruction("");
    } else {
      setError(result.error.message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" disabled={disabled} />}>Regenerate plan</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate the whole plan</DialogTitle>
          <DialogDescription>
            Produces a completely fresh outline. Nothing is saved yet — review it and click Save Version to apply, or discard it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="plan-whole-instruction">
            Instruction (optional)
          </label>
          <Textarea
            id="plan-whole-instruction"
            rows={3}
            placeholder="e.g. Emphasize the cost-savings angle over efficiency."
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={pending}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleRegenerate} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Regenerating...
              </>
            ) : (
              "Regenerate"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
