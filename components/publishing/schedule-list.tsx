"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Loader2 } from "lucide-react";
import { rescheduleQueueItemAction, cancelQueueItemAction } from "@/actions/publishing";
import { validateSchedule } from "@/lib/publishing/validate";
import { LocalDateTime } from "@/components/shared/local-date-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { GlobalQueueEntry } from "@/lib/publishing/service";

const CHANNEL_LABEL: Record<string, string> = { linkedin: "LinkedIn", x: "X", newsletter: "Newsletter" };
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  queued: "default",
  scheduled: "secondary",
  cancelled: "outline",
};

/** Items with no scheduled time are waiting to go out, not waiting for a date. */
const UNSCHEDULED = "unscheduled";

/**
 * Everything queued across every request, on one page, with the controls
 * that used to live only inside a request.
 *
 * The page was read-only: it listed what was queued and deep-linked back
 * into each request to change it. That made the one page called
 * "Publishing Queue" the one place the queue could not be managed. Grouped
 * by date because a schedule is a question about *when*, and answering it
 * by scrolling a list ordered by creation time is work.
 */
export function ScheduleList({ entries }: { entries: GlobalQueueEntry[] }) {
  const groups = useMemo(() => {
    const byDay = new Map<string, GlobalQueueEntry[]>();
    for (const entry of entries) {
      const key = entry.item.scheduled_at ? entry.item.scheduled_at.slice(0, 10) : UNSCHEDULED;
      byDay.set(key, [...(byDay.get(key) ?? []), entry]);
    }

    // Unscheduled first — it is the queue proper, everything else is a
    // calendar — then the remaining days in the order they will happen.
    return [...byDay.entries()].sort(([a], [b]) => {
      if (a === UNSCHEDULED) return -1;
      if (b === UNSCHEDULED) return 1;
      return a.localeCompare(b);
    });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">Nothing scheduled</p>
        <p className="text-sm text-muted-foreground">Approve a package, then queue its channels from the request.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([day, dayEntries]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {day === UNSCHEDULED ? (
              "Queued to go out now"
            ) : (
              <LocalDateTime value={`${day}T12:00:00.000Z`} dateOnly />
            )}
          </h2>
          <div className="flex flex-col divide-y rounded-lg border">
            {dayEntries.map((entry) => (
              <ScheduleRow key={entry.item.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ScheduleRow({ entry }: { entry: GlobalQueueEntry }) {
  const { item } = entry;
  const [editing, setEditing] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(item.scheduled_at ? item.scheduled_at.slice(0, 16) : "");
  const [timezone] = useState(item.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isActive = item.status === "queued" || item.status === "scheduled";

  function save() {
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
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelQueueItemAction(item.id, "Cancelled from the schedule");
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={`/requests/${item.request_id}`} className="font-medium hover:underline">
            {entry.requestTopic}
          </Link>
          <span className="text-xs text-muted-foreground">
            {CHANNEL_LABEL[item.channel] ?? item.channel} · Package v{entry.packageVersion}
            {item.scheduled_at ? (
              <>
                {" · "}
                <LocalDateTime value={item.scheduled_at} />
              </>
            ) : null}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>{item.status}</Badge>
          {isActive ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing((e) => !e)} disabled={isPending}>
                <CalendarClock aria-hidden className="size-4" />
                {item.scheduled_at ? "Reschedule" : "Schedule"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={isPending}>
                Cancel
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            disabled={isPending}
            className="w-fit"
            aria-label={`Scheduled time for ${entry.requestTopic} on ${CHANNEL_LABEL[item.channel] ?? item.channel}`}
          />
          <Button type="button" size="sm" onClick={save} disabled={isPending}>
            {isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
            Close
          </Button>
          {/* Clearing the time returns the item to the immediate queue,
              which is a real choice and not the same as cancelling. */}
          {item.scheduled_at ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setScheduledAt("");
                startTransition(async () => {
                  const result = await rescheduleQueueItemAction(item.id, null);
                  if (result.ok) {
                    setEditing(false);
                    router.refresh();
                  } else setError(result.error.message);
                });
              }}
              disabled={isPending}
            >
              Send now instead
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
