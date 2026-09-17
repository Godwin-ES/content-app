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
import { Pencil } from "lucide-react";
import { ChannelRegenerateDialog } from "@/components/channels/channel-regenerate-dialog";
import type { Newsletter } from "@/lib/ai/schemas/channel";

interface NewsletterEditorProps {
  artifactId: string;
  content: Newsletter;
  locked: boolean;
  onBusyChange: (busy: boolean) => void;
}

type NewsletterField = keyof Newsletter;

const FIELD_LABELS: Record<NewsletterField, string> = {
  subject: "Subject",
  introduction: "Introduction",
  bodyMarkdown: "Body",
  callToAction: "Call to action",
  signoff: "Signoff",
};

const FIELD_INSTRUCTION_PREFIX: Record<NewsletterField, string> = {
  subject: "Only change the subject line; keep everything else exactly the same.",
  introduction: "Only change the introduction (keep it to 1-3 sentences); keep everything else exactly the same.",
  bodyMarkdown: "Only change the main body; keep everything else exactly the same.",
  callToAction: "Only change the call to action; keep everything else exactly the same.",
  signoff: "Only change the signoff; keep everything else exactly the same.",
};

/**
 * Newsletter in its natural layout (SYSTEM-DESIGN-NEXTJS.md §21 Step 5):
 * subject, introduction, body, CTA, and signoff as distinct fields, each
 * with its own Edit(inline)/Regenerate(AI) controls (Phase 5 of the
 * post-Task-22 UX pass) — neither persists by itself; only "Save Version"
 * writes a new version, covering every field edited/regenerated so far.
 */
export function NewsletterEditor({ artifactId, content, locked, onBusyChange }: NewsletterEditorProps) {
  const [draft, setDraft] = useState<Newsletter>(content);
  const [editingField, setEditingField] = useState<NewsletterField | null>(null);
  const [fieldValue, setFieldValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const isDirty = JSON.stringify(draft) !== JSON.stringify(content);
  const busy = locked || isSaving;

  function startEditing(field: NewsletterField) {
    setFieldValue(draft[field]);
    setEditingField(field);
  }

  function saveFieldEdit() {
    if (!editingField) return;
    setDraft((prev) => ({ ...prev, [editingField]: fieldValue }));
    setEditingField(null);
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

  function renderField(field: NewsletterField, options?: { multiline?: boolean; markdown?: boolean }) {
    const isEditingThis = editingField === field;
    return (
      <div className="flex flex-col gap-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">{FIELD_LABELS[field]}</p>
          {editingField === null ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${FIELD_LABELS[field]}`}
                onClick={() => startEditing(field)}
                disabled={busy}
              >
                <Pencil className="size-4" />
              </Button>
              <ChannelRegenerateDialog
                artifactId={artifactId}
                label={FIELD_LABELS[field]}
                instructionPrefix={FIELD_INSTRUCTION_PREFIX[field]}
                onRegenerated={(proposal) => {
                  const value = (proposal as Newsletter)[field];
                  setDraft((prev) => ({ ...prev, [field]: value }));
                }}
                disabled={busy}
                onBusyChange={onBusyChange}
              />
            </div>
          ) : null}
        </div>

        {isEditingThis ? (
          <div className="flex flex-col gap-2">
            {options?.multiline ? (
              <Textarea value={fieldValue} onChange={(e) => setFieldValue(e.target.value)} rows={field === "bodyMarkdown" ? 14 : 3} />
            ) : (
              <Input value={fieldValue} onChange={(e) => setFieldValue(e.target.value)} />
            )}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={saveFieldEdit}>
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditingField(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : options?.markdown ? (
          <MarkdownBody>{draft[field]}</MarkdownBody>
        ) : (
          <p className="text-sm">{draft[field]}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-medium uppercase text-muted-foreground">Newsletter</Label>
      {renderField("subject")}
      {renderField("introduction", { multiline: true })}
      {renderField("bodyMarkdown", { multiline: true, markdown: true })}
      {renderField("callToAction")}
      {renderField("signoff")}

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
