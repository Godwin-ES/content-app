"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveManualChannelRevisionAction } from "@/actions/channels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MarkdownBody } from "@/components/shared/markdown-body";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import { ChannelRegenerateDialog } from "@/components/channels/channel-regenerate-dialog";
import type { XPost } from "@/lib/ai/schemas/channel";

interface XEditorProps {
  artifactId: string;
  content: XPost;
  locked: boolean;
  onBusyChange: (busy: boolean) => void;
}

function parseHashtags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * X post in its natural layout, with Edit/Regenerate beside the post
 * itself (Phase 5 of the post-Task-22 UX pass) — neither persists by
 * itself; only "Save Version" writes a new version.
 */
export function XEditor({ artifactId, content, locked, onBusyChange }: XEditorProps) {
  const [draft, setDraft] = useState<XPost>(content);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(content.body);
  const [editHashtags, setEditHashtags] = useState(content.hashtags.join(" "));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const isDirty = JSON.stringify(draft) !== JSON.stringify(content);
  const busy = locked || isSaving;

  function startEditing() {
    setEditBody(draft.body);
    setEditHashtags(draft.hashtags.join(" "));
    setEditing(true);
  }

  function saveEdit() {
    setDraft({ body: editBody, hashtags: parseHashtags(editHashtags) });
    setEditing(false);
  }

  function discard() {
    setDraft(content);
    setError(null);
  }

  async function saveVersion() {
    setError(null);
    setIsSaving(true);
    const result = await saveManualChannelRevisionAction(artifactId, draft);
    setIsSaving(false);
    if (result.ok) router.refresh();
    else setError(result.error.message);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase text-muted-foreground">X post</p>
        {!editing ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Edit X post" onClick={startEditing} disabled={busy}>
              <Pencil className="size-4" />
            </Button>
            <ChannelRegenerateDialog
              artifactId={artifactId}
              label="X post"
              onRegenerated={(proposal) => setDraft(proposal as XPost)}
              disabled={busy}
              onBusyChange={onBusyChange}
            />
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="x-body">Post body</Label>
            <Textarea id="x-body" value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={4} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="x-hashtags">Hashtags (space or comma separated, at most 2)</Label>
            <Input id="x-hashtags" value={editHashtags} onChange={(e) => setEditHashtags(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={saveEdit}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <MarkdownBody className="rounded-md border p-4">{draft.body}</MarkdownBody>
          {draft.hashtags.length > 0 ? (
            <div className="flex gap-1">
              {draft.hashtags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isDirty ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <p className="flex-1 text-sm text-muted-foreground">You have unsaved changes.</p>
          <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={busy}>
            Discard
          </Button>
          <Button type="button" size="sm" onClick={saveVersion} disabled={busy}>
            {isSaving ? "Saving..." : "Save Version"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
