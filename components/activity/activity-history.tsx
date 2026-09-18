"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LocalDateTime } from "@/components/shared/local-date-time";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type ActivityEventRow = Database["public"]["Tables"]["activity_events"]["Row"];

const PAGE_SIZE = 15;

/**
 * The request's history, collapsed by default and shown a page at a time —
 * it belongs on the Overview next to everything else about the request,
 * rather than behind a tab of its own that has to be sought out.
 *
 * Every event's `message` is already written as prose where it is recorded
 * ("Package v1 created"), so this renders that and its timestamp. No
 * provider or system detail (model names, token counts, stack traces) ever
 * appears here; that belongs to the operational logs.
 */
export function ActivityHistory({ events }: { events: ActivityEventRow[] }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  // Newest first: the most recent thing that happened is the one being
  // looked for.
  const ordered = events.slice().reverse();
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const visible = ordered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Activity</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Hide activity" : `Show activity (${ordered.length})`}
        </Button>
      </div>

      {!open ? null : ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has happened on this request yet.</p>
      ) : (
        <>
          <ol className="flex flex-col divide-y">
            {visible.map((event) => (
              <li key={event.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                <p className="text-sm">{event.message}</p>
                <LocalDateTime value={event.created_at} className="text-xs text-muted-foreground" />
              </li>
            ))}
          </ol>

          {pageCount > 1 ? (
            <div className="flex flex-wrap items-center gap-1">
              {Array.from({ length: pageCount }, (_, i) => (
                <Button
                  key={i}
                  type="button"
                  variant={i === page ? "default" : "ghost"}
                  size="sm"
                  className={cn("size-8 p-0 tabular-nums")}
                  aria-label={`Activity page ${i + 1}`}
                  aria-current={i === page ? "page" : undefined}
                  onClick={() => setPage(i)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
