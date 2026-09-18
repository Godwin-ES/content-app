import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGlobalPublishingQueue } from "@/lib/publishing/service";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { listChannelConnections } from "@/lib/repositories/settings";

const CHANNEL_LABEL: Record<string, string> = { linkedin: "LinkedIn", x: "X", newsletter: "Newsletter" };
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  queued: "default",
  scheduled: "secondary",
  cancelled: "outline",
};

/**
 * Publishing Queue (SYSTEM-DESIGN-NEXTJS.md §34.1, §34.10) — every queue
 * item across your own requests. Only queued/scheduled/cancelled statuses
 * ever appear; nothing here claims an external platform actually received
 * the content.
 */
export default async function PublishingQueuePage() {
  const user = await requireCurrentUser();

  const supabase = await createSupabaseServerClient();
  const [entries, connections] = await Promise.all([
    getGlobalPublishingQueue(supabase),
    listChannelConnections(supabase, user.userId),
  ]);

  // Only worth mentioning for channels something is actually waiting on —
  // a standing "connect your channels" nag on an empty queue would be
  // noise, and the queue is the place you notice it matters.
  const queuedChannels = new Set(entries.filter((e) => e.item.status !== "cancelled").map((e) => e.item.channel));
  const unconnected = connections.filter((c) => !c.connected && queuedChannels.has(c.channel));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Publishing Queue</h1>
        <p className="text-sm text-muted-foreground">Every channel item queued or scheduled from an approved package.</p>
      </div>

      {unconnected.length > 0 ? (
        <Alert>
          <AlertDescription>
            {unconnected.map((c) => CHANNEL_LABEL[c.channel]).join(" and ")}{" "}
            {unconnected.length === 1 ? "has" : "have"} queued content but no destination yet.{" "}
            <Link href="/settings" className="underline">
              Add one in settings
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has been queued yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map(({ item, requestTopic, packageVersion }) => (
            <li key={item.id}>
              <Link href={`/requests/${item.request_id}`} className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:bg-muted/50">
                <div>
                  <p className="font-medium">{requestTopic}</p>
                  <p className="text-xs text-muted-foreground">
                    {CHANNEL_LABEL[item.channel] ?? item.channel} · Package v{packageVersion} ·{" "}
                    {item.scheduled_at ? `Scheduled ${new Date(item.scheduled_at).toLocaleString()}` : "Queued immediately"}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>{item.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
