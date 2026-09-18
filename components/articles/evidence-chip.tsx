"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * One evidence packet, as much of it as a reader needs to judge it.
 *
 * Deliberately the same fields the writer is given — excerpt, conservative
 * summary, what it supports, what it does not establish — because the
 * point of opening one is to check whether the section leaning on it is
 * entitled to. Showing a friendlier subset would make that impossible.
 */
export interface EvidencePreview {
  evidenceId: string;
  publisher: string | null;
  url: string | null;
  excerpt: string;
  conservativeSummary: string;
  supports: string[];
  doesNotEstablish: string[];
}

/**
 * An evidence ID you can open.
 *
 * `S1:adoption_rates` names a specific excerpt from a specific source, and
 * the plan is built entirely out of these references — but until now they
 * were unopenable strings, so checking whether a section's evidence
 * actually said what the section claimed meant going to the Research tab
 * and finding it by hand. Reading an ID is not the same as being able to
 * read the evidence.
 *
 * An ID with nothing behind it stays a plain chip rather than becoming a
 * button that opens an empty dialog: that happens when a plan version
 * outlives the source set it was written against, and the chip saying so
 * quietly is better than a dead control.
 */
export function EvidenceChip({ evidenceId, preview }: { evidenceId: string; preview?: EvidencePreview }) {
  const [open, setOpen] = useState(false);

  if (!preview) {
    return (
      <Badge
        variant="outline"
        className="h-auto max-w-full py-0.5 font-mono break-all whitespace-normal opacity-60"
        title="This evidence is not in the request's current source set."
      >
        {evidenceId}
      </Badge>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={`View evidence ${evidenceId}`}
            className="max-w-full cursor-pointer rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        }
      >
        <Badge
          variant="outline"
          className="h-auto max-w-full py-0.5 font-mono break-all whitespace-normal hover:bg-accent hover:text-accent-foreground"
        >
          {evidenceId}
        </Badge>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm break-all">{evidenceId}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{preview.publisher ?? "Unknown publisher"}</span>
            {preview.url ? (
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
              >
                Open source <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Excerpt</span>
            {/* Quoted from the page verbatim, so it is set apart rather than
                blended into the application's own prose. */}
            <blockquote className="border-l-2 pl-3 whitespace-pre-wrap text-foreground/90">{preview.excerpt}</blockquote>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Conservative summary</span>
            <p>{preview.conservativeSummary}</p>
          </div>

          {preview.supports.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Supports</span>
              <ul className="list-inside list-disc text-muted-foreground">
                {preview.supports.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.doesNotEstablish.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Does not establish</span>
              <ul className="list-inside list-disc text-muted-foreground">
                {preview.doesNotEstablish.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
