"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/domain/errors";

/**
 * A single request-level setting shown with its current value and edited in
 * place, with explicit Save and Cancel — the same rule as every other edit
 * in the workspace: nothing is written until you say so, and cancelling
 * restores exactly what was there.
 *
 * Both settings it is used for (primary keyword, call to action) are
 * derived when left blank, so clearing the field is a real operation and
 * the empty state says which step will fill it in rather than showing a
 * blank line.
 */
export function EditableSetting({
  label,
  description,
  value,
  derivedLabel,
  placeholder,
  onSave,
  disabled = false,
}: {
  label: string;
  description: string;
  value: string | null;
  /** What the empty state means — "Will be derived from research", say. */
  derivedLabel: string;
  placeholder: string;
  onSave: (next: string) => Promise<ActionResult<null>>;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function startEditing() {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await onSave(draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{label}</h3>
        {editing ? null : (
          <Button type="button" variant="outline" size="sm" onClick={startEditing} disabled={disabled}>
            <Pencil aria-hidden className="size-4" />
            {value ? "Edit" : "Set"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} disabled={saving} autoFocus />
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className={value ? "text-sm font-medium" : "text-sm text-muted-foreground italic"}>{value ?? derivedLabel}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
