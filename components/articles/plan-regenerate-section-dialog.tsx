"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { regeneratePlanSectionPreviewAction } from "@/actions/planning";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ContentPlanSection } from "@/lib/ai/schemas/content-plan";

interface PlanRegenerateSectionDialogProps {
  requestId: string;
  sectionIndex: number;
  sectionLabel: string;
  currentDraft: { title: string; angle: string; sections: ContentPlanSection[] };
  onRegenerated: (section: ContentPlanSection) => void;
  disabled?: boolean;
  onRegenerationStart?: () => void;
  onRegenerationEnd?: () => void;
}

/**
 * Regenerates one plan section, mirroring week-3's RegenerateSectionDialog:
 * nothing is saved here — the result lands in the caller's shared draft
 * buffer, for review and "Save Version" together with any other unsaved
 * edits (Phase 3 of the post-Task-22 UX pass).
 */
export function PlanRegenerateSectionDialog({
  requestId,
  sectionIndex,
  sectionLabel,
  currentDraft,
  onRegenerated,
  disabled = false,
  onRegenerationStart,
  onRegenerationEnd,
}: PlanRegenerateSectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerate() {
    setPending(true);
    setError(null);
    onRegenerationStart?.();
    const result = await regeneratePlanSectionPreviewAction(requestId, currentDraft, sectionIndex, instruction.trim() || null);
    setPending(false);
    onRegenerationEnd?.();
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
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="icon" aria-label={`Regenerate ${sectionLabel}`} disabled={disabled} />}
      >
        <Sparkles className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate: {sectionLabel}</DialogTitle>
          <DialogDescription>
            Only this section changes. Nothing is saved yet — review the result and click Save Version to apply it, alongside any other
            unsaved edits.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="plan-section-instruction">
            Instruction (optional)
          </label>
          <Textarea
            id="plan-section-instruction"
            rows={3}
            placeholder="e.g. Focus more on cost savings, or make this shorter."
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
