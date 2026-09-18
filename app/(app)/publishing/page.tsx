import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGlobalPublishingQueue } from "@/lib/publishing/service";
import { listChannelConnections } from "@/lib/repositories/settings";
import { ScheduleList } from "@/components/publishing/schedule-list";
import { Alert, AlertDescription } from "@/components/ui/alert";

const CHANNEL_LABEL: Record<string, string> = { linkedin: "LinkedIn", x: "X", newsletter: "Newsletter" };

/**
 * Schedule (SYSTEM-DESIGN-NEXTJS.md §34.1, §34.10): everything queued or
 * scheduled across your own requests, grouped by when it goes out — and
 * changeable here, which is the part that was missing. It was called
 * Publishing Queue and was the one place the queue could not be managed.
 *
 * Only queued/scheduled/cancelled statuses ever appear; nothing here
 * claims an external platform actually received anything.
 */
export default async function SchedulePage() {
  const user = await requireCurrentUser();

  const supabase = await createSupabaseServerClient();
  const [entries, connections] = await Promise.all([
    getGlobalPublishingQueue(supabase),
    listChannelConnections(supabase, user.userId),
  ]);

  // Only worth mentioning for channels something is actually waiting on —
  // a standing "connect your channels" nag on an empty schedule would be
  // noise, and this is the page where it starts to matter.
  const queuedChannels = new Set(entries.filter((e) => e.item.status !== "cancelled").map((e) => e.item.channel));
  const unconnected = connections.filter((c) => !c.connected && queuedChannels.has(c.channel));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Approved content, queued or scheduled for its channels. Koya schedules — it never posts on your behalf.
        </p>
      </div>

      {unconnected.length > 0 ? (
        <Alert>
          <AlertDescription>
            {unconnected.map((c) => CHANNEL_LABEL[c.channel]).join(" and ")}{" "}
            {unconnected.length === 1 ? "has" : "have"} content scheduled but no destination yet.{" "}
            <Link href="/settings" className="underline">
              Add one in settings
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <ScheduleList entries={entries} />
    </div>
  );
}
