"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveManualChannelRevisionAction } from "@/actions/channels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MarkdownBody } from "@/components/shared/markdown-body";
import { Loader2, Pencil } from "lucide-react";
import { ChannelRegenerateDialog } from "@/components/channels/channel-regenerate-dialog";
import type { LinkedinPost } from "@/lib/ai/schemas/channel";

interface LinkedinEditorProps {
  artifactId: string;
  content: LinkedinPost;
  locked: boolean;
  onBusyChange: (busy: boolean) => void;
}

/**
 * LinkedIn post in its natural layout, with Edit/Regenerate beside the
 * post itself (Phase 5 of the post-Task-22 UX pass) — neither persists by
 * itself; only "Save Version" writes a new version.
 */
export function LinkedinEditor({ artifactId, content, locked, onBusyChange }: LinkedinEditorProps) {
  const [draft, setDraft] = useState<LinkedinPost>(content);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(content.body);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const isDirty = JSON.stringify(draft) !== JSON.stringify(content);
  const busy = locked || isSaving;

  function startEditing() {
    setEditBody(draft.body);
    setEditing(true);
  }

  function saveEdit() {
    setDraft({ ...draft, body: editBody });
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
        <p className="text-xs font-medium uppercase text-muted-foreground">LinkedIn post</p>
        {!editing ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Edit LinkedIn post" onClick={startEditing} disabled={busy}>
              <Pencil className="size-4" />
            </Button>
            <ChannelRegenerateDialog
              artifactId={artifactId}
              label="LinkedIn post"
              onRegenerated={(proposal) => setDraft(proposal as LinkedinPost)}
              disabled={busy}
              onBusyChange={onBusyChange}
            />
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="linkedin-body">Post body</Label>
            <Textarea id="linkedin-body" value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={10} />
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
        <MarkdownBody className="rounded-md border p-4">{draft.body}</MarkdownBody>
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
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving...
              </>
            ) : (
              "Save Version"
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
