"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setDiscordWebhookAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Where this account's notifications go.
 *
 * The stored URL is never shown back in full. A webhook is a credential —
 * anyone holding it can post into that channel — and there is no reason to
 * paint it across the screen to confirm it is set. The tail is enough to
 * tell one from another.
 */
export function DiscordWebhookForm({ webhookUrl }: { webhookUrl: string | null }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save(next: string) {
    setSaving(true);
    setError(null);
    const result = await setDiscordWebhookAction(next);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setValue("");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Discord notifications</h3>
        <Badge variant={webhookUrl ? "outline" : "secondary"}>{webhookUrl ? "Connected" : "Not connected"}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Koya posts here when a package is approved, when research finds nothing covering your primary keyword, and when
        something goes wrong. Create a webhook in Discord under Server Settings → Integrations → Webhooks, then paste its URL.
      </p>

      {webhookUrl ? (
        <p className="text-sm">
          Currently posting to a webhook ending <span className="font-mono">…{webhookUrl.slice(-6)}</span>
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="discord-webhook">{webhookUrl ? "Replace with a new webhook URL" : "Webhook URL"}</Label>
        <Input
          id="discord-webhook"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          disabled={saving}
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => save(value)} disabled={saving || !value.trim()}>
          {saving ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {webhookUrl ? "Replace" : "Connect"}
        </Button>
        {webhookUrl ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => save("")} disabled={saving}>
            Disconnect
          </Button>
        ) : null}
      </div>
    </section>
  );
}
