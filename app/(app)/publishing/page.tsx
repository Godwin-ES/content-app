import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGlobalPublishingQueue } from "@/lib/publishing/service";
import { Badge } from "@/components/ui/badge";

const CHANNEL_LABEL: Record<string, string> = { linkedin: "LinkedIn", x: "X", newsletter: "Newsletter" };
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  queued: "default",
  scheduled: "secondary",
  cancelled: "outline",
};

/**
 * Content Manager nav: Publishing Queue (SYSTEM-DESIGN-NEXTJS.md §34.1,
 * §34.10) — every queue item across the Content Manager's own requests.
 * Only queued/scheduled/cancelled statuses ever appear; nothing here
 * claims an external platform actually received the content.
 */
export default async function PublishingQueuePage() {
  const user = await requireRole("content_manager");
  if (user.role !== "content_manager") notFound();

  const supabase = await createSupabaseServerClient();
  const entries = await getGlobalPublishingQueue(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Publishing Queue</h1>
        <p className="text-sm text-muted-foreground">Every channel item queued or scheduled from an approved package.</p>
      </div>

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
