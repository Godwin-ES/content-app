"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setDisplayNameAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Signing up guesses a name — from Google, from signup metadata, or from
 * the local part of the email. This is how you correct the guess.
 */
export function DisplayNameForm({ displayName, email }: { displayName: string; email: string }) {
  const [value, setValue] = useState(displayName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    setSaving(true);
    setError(null);
    const result = await setDisplayNameAction(value);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="font-medium">Account</h3>
      <p className="text-sm text-muted-foreground">{email}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input id="display-name" value={value} onChange={(e) => setValue(e.target.value)} disabled={saving} />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" size="sm" className="w-fit" onClick={save} disabled={saving || value.trim() === displayName}>
        {saving ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        Save
      </Button>
    </section>
  );
}
