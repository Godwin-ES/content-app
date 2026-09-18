"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, X } from "lucide-react";
import { saveChannelConnectionAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ChannelConnection } from "@/lib/repositories/settings";

const CHANNEL_COPY: Record<
  ChannelConnection["channel"],
  { title: string; labelField: string; labelPlaceholder: string; urlPlaceholder: string; blurb: string }
> = {
  linkedin: {
    title: "LinkedIn",
    labelField: "Profile or page name",
    labelPlaceholder: "Koya Talent",
    urlPlaceholder: "linkedin.com/company/koya-talent",
    blurb: "Where approved LinkedIn posts are headed.",
  },
  x: {
    title: "X",
    labelField: "Handle",
    labelPlaceholder: "@koyatalent",
    urlPlaceholder: "x.com/koyatalent",
    blurb: "Where approved X posts are headed.",
  },
  newsletter: {
    title: "Newsletter",
    labelField: "List name",
    labelPlaceholder: "Weekly talent brief",
    urlPlaceholder: "",
    blurb: "Who receives an approved newsletter.",
  },
};

/**
 * One destination. These are deliberately not OAuth connections: the
 * publishing step queues content rather than posting it, so what the app
 * genuinely knows is where each approved asset is meant to go — an
 * account, a handle, a recipient list. Calling it anything more would be a
 * claim the app cannot back up.
 */
export function ChannelConnectionCard({ connection }: { connection: ChannelConnection }) {
  const copy = CHANNEL_COPY[connection.channel];
  const isNewsletter = connection.channel === "newsletter";

  const [label, setLabel] = useState(connection.accountLabel ?? "");
  const [url, setUrl] = useState(connection.accountUrl ?? "");
  const [recipients, setRecipients] = useState<string[]>(connection.recipients);
  const [newRecipient, setNewRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save(connected: boolean) {
    setSaving(true);
    setError(null);
    const result = await saveChannelConnectionAction({
      channel: connection.channel,
      accountLabel: label,
      accountUrl: url,
      recipients,
      connected,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  function addRecipient() {
    const value = newRecipient.trim();
    if (!value || recipients.includes(value)) return;
    setRecipients((list) => [...list, value]);
    setNewRecipient("");
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{copy.title}</h3>
        <Badge variant={connection.connected ? "outline" : "secondary"}>
          {connection.connected ? "Connected" : "Not connected"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{copy.blurb}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${connection.channel}-label`}>{copy.labelField}</Label>
        <Input
          id={`${connection.channel}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={copy.labelPlaceholder}
          disabled={saving}
        />
      </div>

      {isNewsletter ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="newsletter-recipient">Recipients</Label>
          {recipients.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {recipients.map((recipient) => (
                <li key={recipient}>
                  <Badge variant="secondary" className="gap-1.5">
                    {recipient}
                    <button
                      type="button"
                      aria-label={`Remove ${recipient}`}
                      onClick={() => setRecipients((list) => list.filter((r) => r !== recipient))}
                      disabled={saving}
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">No recipients yet.</p>
          )}
          <div className="flex gap-2">
            <Input
              id="newsletter-recipient"
              type="email"
              value={newRecipient}
              onChange={(e) => setNewRecipient(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRecipient();
                }
              }}
              placeholder="reader@example.com"
              disabled={saving}
            />
            <Button type="button" variant="outline" onClick={addRecipient} disabled={saving || !newRecipient.trim()}>
              <Plus aria-hidden className="size-4" />
              Add
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${connection.channel}-url`}>Link</Label>
          <Input
            id={`${connection.channel}-url`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={copy.urlPlaceholder}
            disabled={saving}
          />
        </div>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => save(true)} disabled={saving}>
          {saving ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
          {connection.connected ? "Save" : "Connect"}
        </Button>
        {connection.connected ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => save(false)} disabled={saving}>
            Disconnect
          </Button>
        ) : null}
      </div>
    </section>
  );
}
