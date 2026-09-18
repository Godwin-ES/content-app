import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import {
  createQueueItem,
  rescheduleQueueItem,
  cancelQueueItem,
  listQueueItemsForRequest,
  listQueueItemsForCurrentUser,
  listQueueEvents,
} from "@/lib/repositories/publishing";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type ContentPackageRow = Database["public"]["Tables"]["content_packages"]["Row"];
type QueueItemRow = Database["public"]["Tables"]["publishing_queue_items"]["Row"];
type PublishingEventRow = Database["public"]["Tables"]["publishing_events"]["Row"];
export type PublishingChannel = "linkedin" | "x" | "newsletter";

async function getRequestOrThrow(supabase: SupabaseClient<Database>, requestId: string): Promise<ContentRequestRow> {
  const { data, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !data) throw error ?? new DomainError("NOT_FOUND", "publishing", "Request not found.");
  return data;
}

async function getApprovedPackageOrThrow(
  supabase: SupabaseClient<Database>,
  request: ContentRequestRow
): Promise<ContentPackageRow> {
  if (request.status !== "approved" || !request.current_package_id) {
    throw new DomainError("APPROVAL_REQUIRED", "publishing", "Only the exact current approved package can be queued.");
  }
  const { data: pkg, error } = await supabase.from("content_packages").select().eq("id", request.current_package_id).single();
  if (error || !pkg) throw error ?? new DomainError("NOT_FOUND", "publishing", "Approved package not found.");
  return pkg;
}

function channelVersionId(pkg: ContentPackageRow, channel: PublishingChannel): string {
  if (channel === "linkedin") return pkg.linkedin_version_id;
  if (channel === "x") return pkg.x_version_id;
  return pkg.newsletter_version_id;
}

/**
 * Queues (or schedules) one channel of the request's exact current approved
 * package (SYSTEM-DESIGN-NEXTJS.md §25). A fresh idempotency key is
 * generated per invocation: a genuine double-click produces two distinct
 * keys, which the RPC's own active-item check turns into a clean
 * DUPLICATE_QUEUE_ITEM domain error rather than a duplicate row; the key
 * itself exists so a *single* uncertain network outcome could be safely
 * retried with the same key without ever inserting twice (§27.1).
 */
export async function queueChannel(
  supabase: SupabaseClient<Database>,
  requestId: string,
  channel: PublishingChannel,
  schedule: { scheduledAt: string; timezone: string } | null
): Promise<QueueItemRow> {
  const request = await getRequestOrThrow(supabase, requestId);
  const pkg = await getApprovedPackageOrThrow(supabase, request);

  return createQueueItem(supabase, {
    packageId: pkg.id,
    channel,
    channelArtifactVersionId: channelVersionId(pkg, channel),
    scheduledAt: schedule?.scheduledAt ?? null,
    timezone: schedule?.timezone ?? null,
    idempotencyKey: randomUUID(),
  });
}

/**
 * Changing the schedule time never requires content reapproval (§25.5) —
 * this only ever updates scheduled_at/timezone/status on the existing
 * immutable-reference queue item, never the package or channel content it
 * points to.
 */
export async function rescheduleItem(
  supabase: SupabaseClient<Database>,
  queueItemId: string,
  schedule: { scheduledAt: string; timezone: string } | null
): Promise<QueueItemRow> {
  return rescheduleQueueItem(supabase, {
    queueItemId,
    scheduledAt: schedule?.scheduledAt ?? null,
    timezone: schedule?.timezone ?? null,
  });
}

/**
 * Cancellation is preserved as history, never deleted (§25.6).
 */
export async function cancelItem(
  supabase: SupabaseClient<Database>,
  queueItemId: string,
  reason: string | null
): Promise<QueueItemRow> {
  return cancelQueueItem(supabase, { queueItemId, reason });
}

export interface PublishingQueueEntry {
  item: QueueItemRow;
  events: PublishingEventRow[];
}

export interface PublishingQueueContext {
  request: ContentRequestRow;
  currentPackage: ContentPackageRow | null;
  entries: PublishingQueueEntry[];
  queueableChannels: PublishingChannel[];
}

const ALL_CHANNELS: PublishingChannel[] = ["linkedin", "x", "newsletter"];

/**
 * Everything the publishing workspace needs for one request: the current
 * approved package (if any), every queue item that has ever existed for
 * this request with its full append-only event history, and which
 * channels of the *current* package are still free to queue.
 */
export async function getPublishingQueue(supabase: SupabaseClient<Database>, requestId: string): Promise<PublishingQueueContext> {
  const request = await getRequestOrThrow(supabase, requestId);

  let currentPackage: ContentPackageRow | null = null;
  if (request.current_package_id) {
    const { data } = await supabase.from("content_packages").select().eq("id", request.current_package_id).maybeSingle();
    currentPackage = data ?? null;
  }

  const items = await listQueueItemsForRequest(supabase, requestId);
  const entries = await Promise.all(
    items.map(async (item) => ({ item, events: await listQueueEvents(supabase, item.id) }))
  );

  const activeChannelsForCurrentPackage = new Set(
    items.filter((i) => currentPackage && i.package_id === currentPackage.id && i.status !== "cancelled").map((i) => i.channel)
  );
  const queueableChannels =
    request.status === "approved" && currentPackage
      ? ALL_CHANNELS.filter((c) => !activeChannelsForCurrentPackage.has(c))
      : [];

  return { request, currentPackage, entries, queueableChannels };
}

export interface GlobalQueueEntry {
  item: QueueItemRow;
  requestTopic: string;
  packageVersion: number;
}

/**
 * The Schedule page (SYSTEM-DESIGN-NEXTJS.md §34.1,
 * §34.10): every queue item across the account's own requests, each
 * labeled with its request and exact package version.
 */
export async function getGlobalPublishingQueue(supabase: SupabaseClient<Database>): Promise<GlobalQueueEntry[]> {
  const items = await listQueueItemsForCurrentUser(supabase);
  const entries = await Promise.all(
    items.map(async (item) => {
      const { data: request } = await supabase
        .from("content_requests")
        .select("topic, deleted_at")
        .eq("id", item.request_id)
        .maybeSingle();
      const { data: pkg } = await supabase.from("content_packages").select("version_number").eq("id", item.package_id).maybeSingle();
      return {
        item,
        requestTopic: request?.topic ?? "Unknown request",
        packageVersion: pkg?.version_number ?? 0,
        binned: Boolean(request?.deleted_at),
      };
    })
  );

  // A binned request's items are already cancelled, but leaving them in the
  // queue would list work for something the owner has thrown away. They
  // come back with the request if it is restored.
  return entries.filter((entry) => !entry.binned).map(({ binned, ...entry }) => {
    void binned;
    return entry;
  });
}
