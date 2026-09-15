"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/database.types";

type PublishingEventRow = Database["public"]["Tables"]["publishing_events"]["Row"];

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  scheduled: "Scheduled",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
};

/**
 * Append-only queue history (SYSTEM-DESIGN-NEXTJS.md §25.6, §32.16) — a
 * cancelled item is never deleted, only marked cancelled with its full
 * event trail intact.
 */
export function PublishingEventHistory({ events }: { events: PublishingEventRow[] }) {
  const [open, setOpen] = useState(false);

  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="link" size="sm" className="w-fit px-0" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide history" : "View history"}
      </Button>
      {open ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {events.map((event) => (
            <li key={event.id}>
              {EVENT_LABEL[event.event_type] ?? event.event_type} · {new Date(event.created_at).toLocaleString()}
              {event.reason ? ` — "${event.reason}"` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
