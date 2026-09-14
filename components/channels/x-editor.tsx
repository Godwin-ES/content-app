"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveManualChannelRevisionAction } from "@/actions/channels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { XPost } from "@/lib/ai/schemas/channel";

interface XEditorProps {
  artifactId: string;
  content: XPost;
}

function parseHashtags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * X post in its natural layout (SYSTEM-DESIGN-NEXTJS.md §21 Step 5): a
 * short focused post plus its hashtags, not a generic small-text modal.
 */
export function XEditor({ artifactId, content }: XEditorProps) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(content.body);
  const [hashtagsInput, setHashtagsInput] = useState(content.hashtags.join(" "));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function cancel() {
    setBody(content.body);
    setHashtagsInput(content.hashtags.join(" "));
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveManualChannelRevisionAction(artifactId, { body, hashtags: parseHashtags(hashtagsInput) });
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
          <p className="text-xs font-medium uppercase text-muted-foreground">X post</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <div className="whitespace-pre-wrap rounded-md border p-4 text-sm">{content.body}</div>
        {content.hashtags.length > 0 ? (
          <div className="flex gap-1">
            {content.hashtags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="x-body">Post body</Label>
        <Textarea id="x-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="x-hashtags">Hashtags (space or comma separated, at most 2)</Label>
        <Input id="x-hashtags" value={hashtagsInput} onChange={(e) => setHashtagsInput(e.target.value)} />
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
