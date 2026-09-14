"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { proposeTargetedRevisionAction, applyTargetedRevisionAction } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ArticleOutput } from "@/lib/ai/schemas/article";

interface TargetedRevisionPanelProps {
  articleVersionId: string;
  currentContent: ArticleOutput;
}

/**
 * Targeted AI revision, reviewed before application
 * (SYSTEM-DESIGN-NEXTJS.md §19): proposing never mutates anything; only
 * "Apply Revision" creates a new immutable version.
 */
export function TargetedRevisionPanel({ articleVersionId, currentContent }: TargetedRevisionPanelProps) {
  const [section, setSection] = useState("");
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<ArticleOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function propose() {
    setError(null);
    startTransition(async () => {
      const result = await proposeTargetedRevisionAction(articleVersionId, section, instruction);
      if (result.ok) {
        setProposal(result.data);
      } else {
        setError(result.error.message);
      }
    });
  }

  function apply() {
    if (!proposal) return;
    setError(null);
    startTransition(async () => {
      const result = await applyTargetedRevisionAction(articleVersionId, proposal);
      if (result.ok) {
        setProposal(null);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h4 className="text-sm font-medium">Targeted AI revision</h4>
      <div className="flex flex-col gap-2">
        <Label htmlFor="target-section">Section to revise</Label>
        <Input id="target-section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Conclusion" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="instruction">Instruction</Label>
        <Textarea id="instruction" value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!proposal ? (
        <Button type="button" size="sm" onClick={propose} disabled={isPending || !section || !instruction} className="w-fit">
          {isPending ? "Proposing..." : "Propose revision"}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-2 text-xs">
              <p className="mb-1 font-medium">Current</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{currentContent.bodyMarkdown}</p>
            </div>
            <div className="rounded-md border border-primary p-2 text-xs">
              <p className="mb-1 font-medium">Proposed</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{proposal.bodyMarkdown}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={apply} disabled={isPending}>
              {isPending ? "Applying..." : "Apply Revision"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setProposal(null)} disabled={isPending}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
