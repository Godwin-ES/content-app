"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rescheduleQueueItemAction, cancelQueueItemAction } from "@/actions/publishing";
import { validateSchedule } from "@/lib/publishing/validate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PublishingEventHistory } from "@/components/publishing/publishing-event-history";
import type { PublishingQueueEntry } from "@/lib/publishing/service";
import type { Database } from "@/lib/supabase/database.types";

type PublishingEventRow = Database["public"]["Tables"]["publishing_events"]["Row"];

const CHANNEL_LABEL: Record<string, string> = { linkedin: "LinkedIn", x: "X", newsletter: "Newsletter" };
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "default",
  scheduled: "secondary",
  cancelled: "outline",
};

function QueueItemRow({ entry }: { entry: PublishingQueueEntry }) {
  const { item, events } = entry;
  const [rescheduling, setRescheduling] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(item.scheduled_at ? item.scheduled_at.slice(0, 16) : "");
  const [timezone, setTimezone] = useState(item.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isActive = item.status === "queued" || item.status === "scheduled";

  function saveReschedule() {
    setError(null);
    const schedule = scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString(), timezone } : null;
    const check = validateSchedule({ scheduledAt: schedule?.scheduledAt ?? null, timezone: schedule?.timezone ?? null });
    if (!check.ok) {
      setError(check.message);
      return;
    }
    startTransition(async () => {
      const result = await rescheduleQueueItemAction(item.id, schedule);
      if (result.ok) {
        setRescheduling(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelQueueItemAction(item.id, "Cancelled by Content Manager");
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{CHANNEL_LABEL[item.channel] ?? item.channel}</span>
        <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>{item.status}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {item.scheduled_at ? `Scheduled for ${new Date(item.scheduled_at).toLocaleString()} (${item.timezone})` : "Queued immediately"}
      </p>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isActive ? (
        rescheduling ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor={`reschedule-${item.id}`}>
                New time (blank = queue immediately)
              </label>
              <Input
                id={`reschedule-${item.id}`}
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            {scheduledAt ? (
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-40" />
            ) : null}
            <Button type="button" size="sm" onClick={saveReschedule} disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRescheduling(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setRescheduling(true)}>
              Reschedule
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={cancel} disabled={isPending}>
              {isPending ? "Cancelling..." : "Cancel"}
            </Button>
          </div>
        )
      ) : null}

      <PublishingEventHistory events={events as PublishingEventRow[]} />
    </li>
  );
}

/**
 * Publishing queue list (SYSTEM-DESIGN-NEXTJS.md §34.10): date/time,
 * channel, exact package, and status — never a claim of external
 * publication (only queued/scheduled/cancelled ever appear).
 */
export function PublishingList({ entries }: { entries: PublishingQueueEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing has been queued yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <QueueItemRow key={entry.item.id} entry={entry} />
      ))}
    </ul>
  );
}
