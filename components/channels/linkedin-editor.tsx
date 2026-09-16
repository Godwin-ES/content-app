"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveManualChannelRevisionAction } from "@/actions/channels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MarkdownBody } from "@/components/shared/markdown-body";
import type { LinkedinPost } from "@/lib/ai/schemas/channel";

interface LinkedinEditorProps {
  artifactId: string;
  content: LinkedinPost;
}

/**
 * LinkedIn post in its natural layout (SYSTEM-DESIGN-NEXTJS.md §21 Step 5):
 * a single post body, not a generic small-text modal.
 */
export function LinkedinEditor({ artifactId, content }: LinkedinEditorProps) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(content.body);
  const [hasCallToAction, setHasCallToAction] = useState(content.hasCallToAction);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function cancel() {
    setBody(content.body);
    setHasCallToAction(content.hasCallToAction);
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveManualChannelRevisionAction(artifactId, { body, hasCallToAction });
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
          <p className="text-xs font-medium uppercase text-muted-foreground">LinkedIn post</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <MarkdownBody className="rounded-md border p-4">{content.body}</MarkdownBody>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="linkedin-body">Post body</Label>
        <Textarea id="linkedin-body" value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
      </div>
      <label className="flex w-fit items-center gap-2 text-sm">
        <input type="checkbox" checked={hasCallToAction} onChange={(e) => setHasCallToAction(e.target.checked)} />
        Includes a call to action
      </label>

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
