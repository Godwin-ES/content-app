"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { proposeChannelRevisionAction } from "@/actions/channels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { LinkedinPost, Newsletter, XPost } from "@/lib/ai/schemas/channel";

interface ChannelRegenerateDialogProps {
  artifactId: string;
  label: string;
  /** Prepended to whatever the Content Manager types, e.g. "Only change the introduction; keep everything else exactly the same." */
  instructionPrefix?: string;
  onRegenerated: (proposal: LinkedinPost | XPost | Newsletter) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Regenerates a channel asset — the whole post for LinkedIn/X, or one
 * named field for the newsletter (Phase 5 of the post-Task-22 UX pass).
 * Nothing is saved here; the proposal replaces the caller's local draft,
 * and only "Save Version" persists it.
 */
export function ChannelRegenerateDialog({
  artifactId,
  label,
  instructionPrefix,
  onRegenerated,
  disabled = false,
  onBusyChange,
}: ChannelRegenerateDialogProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerate() {
    setPending(true);
    setError(null);
    onBusyChange?.(true);
    const fullInstruction = [instructionPrefix, instruction.trim() || null].filter(Boolean).join(" ") || null;
    const result = await proposeChannelRevisionAction(artifactId, fullInstruction);
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
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`Regenerate ${label}`} disabled={disabled} />}>
        <Sparkles className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate: {label}</DialogTitle>
          <DialogDescription>
            Nothing is saved yet — review the result and click Save Version to apply it, alongside any other unsaved edits.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor={`channel-regen-instruction-${artifactId}-${label}`}>
            Instruction (optional)
          </label>
          <Textarea
            id={`channel-regen-instruction-${artifactId}-${label}`}
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
