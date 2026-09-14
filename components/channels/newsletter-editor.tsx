"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveManualChannelRevisionAction } from "@/actions/channels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Newsletter } from "@/lib/ai/schemas/channel";

interface NewsletterEditorProps {
  artifactId: string;
  content: Newsletter;
}

/**
 * Newsletter in its natural layout (SYSTEM-DESIGN-NEXTJS.md §21 Step 5):
 * subject, introduction, body, CTA, and signoff as distinct fields, not a
 * generic small-text modal.
 */
export function NewsletterEditor({ artifactId, content }: NewsletterEditorProps) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(content.subject);
  const [introduction, setIntroduction] = useState(content.introduction);
  const [bodyMarkdown, setBodyMarkdown] = useState(content.bodyMarkdown);
  const [callToAction, setCallToAction] = useState(content.callToAction);
  const [signoff, setSignoff] = useState(content.signoff);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function cancel() {
    setSubject(content.subject);
    setIntroduction(content.introduction);
    setBodyMarkdown(content.bodyMarkdown);
    setCallToAction(content.callToAction);
    setSignoff(content.signoff);
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveManualChannelRevisionAction(artifactId, {
        subject,
        introduction,
        bodyMarkdown,
        callToAction,
        signoff,
      });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Newsletter</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <div className="rounded-md border p-4">
          <p className="font-medium">{content.subject}</p>
          <p className="mt-2 text-sm text-muted-foreground">{content.introduction}</p>
          <div className="mt-3 whitespace-pre-wrap text-sm">{content.bodyMarkdown}</div>
          <p className="mt-3 text-sm font-medium">{content.callToAction}</p>
          <p className="mt-2 text-sm text-muted-foreground">{content.signoff}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="newsletter-subject">Subject</Label>
        <Input id="newsletter-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newsletter-intro">Introduction</Label>
        <Textarea id="newsletter-intro" value={introduction} onChange={(e) => setIntroduction(e.target.value)} rows={2} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newsletter-body">Body</Label>
        <Textarea id="newsletter-body" value={bodyMarkdown} onChange={(e) => setBodyMarkdown(e.target.value)} rows={14} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newsletter-cta">Call to action</Label>
        <Input id="newsletter-cta" value={callToAction} onChange={(e) => setCallToAction(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newsletter-signoff">Signoff</Label>
        <Input id="newsletter-signoff" value={signoff} onChange={(e) => setSignoff(e.target.value)} />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
