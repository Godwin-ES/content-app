"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { proposeTargetedRevisionAction } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ArticleOutput } from "@/lib/ai/schemas/article";

interface ArticleRegenerateSectionDialogProps {
  articleVersionId: string;
  sectionHeading: string;
  defaultInstruction: string | null;
  onRegenerated: (proposal: ArticleOutput) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Regenerates one article section (Phase 4 of the post-Task-22 UX pass) —
 * reuses the existing targeted-revision reviser call (a synthetic
 * single-section evaluation instructs it to change only this section and
 * preserve the rest), just triggered from an icon beside the section
 * instead of a free-text "section to revise" field. Nothing is saved here;
 * the proposal replaces the caller's local draft, and only "Save Version"
 * persists it. The instruction defaults to the evaluator's own revision
 * note when one exists, matching what "Auto-revise" used to do
 * automatically — now the Content Manager reviews and can edit it first.
 */
export function ArticleRegenerateSectionDialog({
  articleVersionId,
  sectionHeading,
  defaultInstruction,
  onRegenerated,
  disabled = false,
  onBusyChange,
}: ArticleRegenerateSectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState(defaultInstruction ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerate() {
    setPending(true);
    setError(null);
    onBusyChange?.(true);
    const result = await proposeTargetedRevisionAction(articleVersionId, sectionHeading, instruction.trim() || "Improve this section.");
    setPending(false);
    onBusyChange?.(false);
    if (result.ok) {
      onRegenerated(result.data);
      setOpen(false);
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
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`Regenerate ${sectionHeading}`} disabled={disabled} />}>
        <Sparkles className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate: {sectionHeading}</DialogTitle>
          <DialogDescription>
            Only this section changes; the rest of the article is preserved. Nothing is saved yet — review the result and click Save
            Version to apply it, alongside any other unsaved edits.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="article-section-instruction">
            Instruction
          </label>
          <Textarea
            id="article-section-instruction"
            rows={3}
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
