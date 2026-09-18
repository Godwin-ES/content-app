"use client";

import { useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CopyButton } from "@/components/requests/copy-button";
import { MarkdownBody } from "@/components/shared/markdown-body";

/**
 * A finished piece, shown the way its reader will see it.
 *
 * "See full article" used to expand a panel inside the package — the same
 * cramped column, the same surrounding furniture, the text merely longer.
 * That answers "what does it say" and not "what does it look like", and
 * the second question is the one you have before publishing something.
 *
 * So it opens instead: wide, on its own, set as an article or an email
 * rather than as a field in a form. The copy button travels with it,
 * because the reason you opened it is usually the reason you are about to
 * paste it somewhere.
 */
function PreviewShell({
  triggerLabel,
  dialogTitle,
  copyText,
  copyLabel,
  children,
}: {
  triggerLabel: string;
  dialogTitle: string;
  copyText: string;
  copyLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Maximize2 aria-hidden className="size-4" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="flex-row items-center justify-between gap-4">
          <DialogTitle className="text-sm font-normal text-muted-foreground">{dialogTitle}</DialogTitle>
          <CopyButton text={copyText} label={copyLabel} />
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The article, set as an article: one measured column, a real headline, the
 * standfirst under it. `prose` does the typographic work — the same
 * rendering the body gets everywhere else, given room to be read.
 */
export function ArticlePreviewDialog({
  title,
  metaDescription,
  bodyMarkdown,
  copyText,
}: {
  title: string;
  metaDescription: string;
  bodyMarkdown: string;
  copyText: string;
}) {
  return (
    <PreviewShell triggerLabel="See full article" dialogTitle="Article preview" copyText={copyText} copyLabel="Copy article">
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-2">
        <header className="flex flex-col gap-2 border-b pb-4">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance">{title}</h1>
          <p className="text-base text-muted-foreground">{metaDescription}</p>
        </header>
        {/* The stored markdown opens with its own H1, which the header
            above already shows; dropping it here avoids the title twice. */}
        <MarkdownBody>{bodyMarkdown.replace(/^#\s+.+\n+/, "")}</MarkdownBody>
      </article>
    </PreviewShell>
  );
}

/**
 * The newsletter, set as an email: a subject line where a subject line
 * goes, then the message. The parts are separate fields in the database
 * and one continuous thing to a reader, so the preview joins them.
 */
export function NewsletterPreviewDialog({
  subject,
  introduction,
  bodyMarkdown,
  callToAction,
  signoff,
  copyText,
}: {
  subject: string;
  introduction: string;
  bodyMarkdown: string;
  callToAction: string;
  signoff: string;
  copyText: string;
}) {
  return (
    <PreviewShell
      triggerLabel="See full newsletter"
      dialogTitle="Newsletter preview"
      copyText={copyText}
      copyLabel="Copy newsletter"
    >
      <div className="mx-auto w-full max-w-2xl py-2">
        <div className="rounded-lg border">
          <div className="flex flex-col gap-1 border-b bg-muted/40 px-5 py-4">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Subject</span>
            <span className="text-lg leading-snug font-semibold text-balance">{subject}</span>
          </div>
          <div className="flex flex-col gap-4 px-5 py-5">
            <p className="text-base leading-relaxed">{introduction}</p>
            <MarkdownBody>{bodyMarkdown}</MarkdownBody>
            <p className="border-t pt-4 font-medium">{callToAction}</p>
            <p className="text-muted-foreground italic">{signoff}</p>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}
