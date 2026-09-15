"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { queueChannelAction } from "@/actions/publishing";
import { validateSchedule } from "@/lib/publishing/validate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PublishingChannel } from "@/lib/publishing/service";

interface QueueControlsProps {
  requestId: string;
  queueableChannels: PublishingChannel[];
}

const CHANNEL_LABEL: Record<PublishingChannel, string> = { linkedin: "LinkedIn", x: "X", newsletter: "Newsletter" };

/**
 * Queue now or Schedule, independently per channel (SYSTEM-DESIGN-NEXTJS.md
 * §25.2-§25.3, §34.10). A blank date queues immediately; a future
 * date/timezone schedules it. Only `queued`/`scheduled`/`cancelled` ever
 * appear — never a claim of external publication.
 */
export function QueueControls({ requestId, queueableChannels }: QueueControlsProps) {
  const [channel, setChannel] = useState<PublishingChannel | "">(queueableChannels[0] ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (queueableChannels.length === 0) {
    return <p className="text-sm text-muted-foreground">Every channel of this package is already queued or scheduled.</p>;
  }

  function submit() {
    if (!channel) return;
    setError(null);

    const schedule = scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString(), timezone } : null;
    const check = validateSchedule({ scheduledAt: schedule?.scheduledAt ?? null, timezone: schedule?.timezone ?? null });
    if (!check.ok) {
      setError(check.message);
      return;
    }

    startTransition(async () => {
      const result = await queueChannelAction(requestId, channel as PublishingChannel, schedule);
      if (result.ok) {
        setScheduledAt("");
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h4 className="text-sm font-medium">Add to Publishing Queue</h4>
      <div className="flex flex-col gap-2">
        <Label htmlFor="queue-channel">Channel</Label>
        <select
          id="queue-channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as PublishingChannel)}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          {queueableChannels.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="queue-schedule">Schedule for (leave blank to queue immediately)</Label>
        <Input id="queue-schedule" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      </div>
      {scheduledAt ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="queue-timezone">Timezone</Label>
          <Input id="queue-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" size="sm" onClick={submit} disabled={isPending} className="w-fit">
        {isPending ? "Saving..." : scheduledAt ? "Schedule" : "Queue Now"}
      </Button>
    </div>
  );
}
