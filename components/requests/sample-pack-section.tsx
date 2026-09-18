"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EvaluationDetails } from "@/components/articles/evaluation-drawer";
import { MarkdownBody } from "@/components/shared/markdown-body";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];

/**
 * Below this, a channel post is short enough to simply read — the whole
 * point of a channel asset is that it is consumable at a glance, so
 * collapsing one that already fits adds a click and gains nothing. Sized so
 * a full-length LinkedIn post (~1,000 characters) sits under it and only
 * genuinely long copy gets cut.
 */
export const CHANNEL_PREVIEW_LIMIT = 1200;

export function needsTruncating(text: string): boolean {
  return text.trim().length > CHANNEL_PREVIEW_LIMIT;
}

/** Cuts at a word boundary so a preview never ends mid-word. */
export function previewOf(text: string): string {
  const trimmed = text.trim();
  if (!needsTruncating(trimmed)) return trimmed;
  const cut = trimmed.slice(0, CHANNEL_PREVIEW_LIMIT);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > CHANNEL_PREVIEW_LIMIT * 0.8 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}

/**
 * The verdict, which opens its own findings. The user's ask was that
 * "EVALUATION: PASS" itself be the thing you click — a reader who trusts
 * the verdict never has to look past it, and one who doesn't gets the
 * deterministic checks and rubric scores behind it without leaving the
 * package.
 */
export function EvaluationVerdict({ status, evaluation }: { status: string; evaluation: EvaluationRow | null }) {
  const [open, setOpen] = useState(false);
  const passed = status.startsWith("pass");
  const label = `Evaluation: ${status}`;

  if (!evaluation) {
    return (
      <Badge variant={passed ? "outline" : "destructive"} className="uppercase">
        {label}
      </Badge>
    );
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Badge variant={passed ? "outline" : "destructive"} className="cursor-pointer uppercase hover:bg-accent">
          {label}
          <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </Badge>
      </button>
      {open ? (
        <div className="w-full text-left">
          <EvaluationDetails evaluation={evaluation} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The packaged article: title, meta description and verdict above the fold,
 * the body itself behind "See full article". An article is thousands of
 * words — printing it inline is what made the old Approval tab something
 * you scrolled past rather than read.
 *
 * Takes the article's text rather than rendered children so nothing has to
 * cross the server/client boundary as an element.
 */
export function ArticleCard({
  status,
  evaluation,
  title,
  metaDescription,
  bodyMarkdown,
}: {
  status: string;
  evaluation: EvaluationRow | null;
  title: string;
  metaDescription: string;
  bodyMarkdown: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Article</h3>
        <EvaluationVerdict status={status} evaluation={evaluation} />
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="font-medium break-words">{title}</h4>
        <p className="text-sm text-muted-foreground">{metaDescription}</p>
      </div>

      {open ? <MarkdownBody>{bodyMarkdown}</MarkdownBody> : null}

      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
        {open ? "Hide article" : "See full article"}
      </Button>
    </section>
  );
}

/**
 * A channel body that shows itself in full when it is short enough to read
 * at a glance and otherwise cuts to a preview with "See more".
 *
 * `markdown` decides how it is rendered: the newsletter body is markdown
 * and must come out formatted, while a LinkedIn or X post is plain text
 * whose own line breaks are load-bearing.
 */
export function ExpandableText({ text, markdown = false }: { text: string; markdown?: boolean }) {
  const [open, setOpen] = useState(false);
  const truncatable = needsTruncating(text);
  const shown = open || !truncatable ? text.trim() : previewOf(text);

  return (
    <div className="flex flex-col gap-2">
      {markdown ? <MarkdownBody>{shown}</MarkdownBody> : <p className="text-sm whitespace-pre-wrap">{shown}</p>}
      {truncatable ? (
        <Button type="button" variant="link" size="sm" className="w-fit px-0" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "See less" : "See more"}
        </Button>
      ) : null}
    </div>
  );
}
