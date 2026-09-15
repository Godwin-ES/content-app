import { LocalDateTime } from "@/components/shared/local-date-time";
import { EmptyState } from "@/components/shared/empty-state";
import type { Database } from "@/lib/supabase/database.types";

type ActivityEventRow = Database["public"]["Tables"]["activity_events"]["Row"];

/**
 * Human-readable business timeline only (SYSTEM-DESIGN-NEXTJS.md §34,
 * Task 19 Step 3) — every event's `message` is already written as prose
 * at the point it's recorded (e.g. "Package v1 created"), so this simply
 * renders that message and its timestamp. No provider/system technical
 * detail (model names, token counts, stack traces) ever appears here;
 * that belongs to test-mode/error tooling instead.
 */
export function ActivityTimeline({ events }: { events: ActivityEventRow[] }) {
  if (events.length === 0) {
    return <EmptyState title="No activity yet" description="Business events for this request will appear here as things happen." />;
  }

  return (
    <ol className="flex flex-col gap-3">
      {events
        .slice()
        .reverse()
        .map((event) => (
          <li key={event.id} className="flex flex-col gap-0.5 border-l-2 border-muted pl-3">
            <p className="text-sm">{event.message}</p>
            <LocalDateTime value={event.created_at} className="text-xs text-muted-foreground" />
          </li>
        ))}
    </ol>
  );
}
