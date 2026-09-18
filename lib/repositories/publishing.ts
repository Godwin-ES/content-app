import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { throwFromRpcError } from "@/lib/supabase/rpc";

type QueueItemRow = Database["public"]["Tables"]["publishing_queue_items"]["Row"];
type PublishingEventRow = Database["public"]["Tables"]["publishing_events"]["Row"];

export async function createQueueItem(
  supabase: SupabaseClient<Database>,
  params: {
    packageId: string;
    channel: "linkedin" | "x" | "newsletter";
    channelArtifactVersionId: string;
    scheduledAt: string | null;
    timezone: string | null;
    idempotencyKey: string;
  }
): Promise<QueueItemRow> {
  const { data, error } = await supabase.rpc("create_queue_item", {
    p_package_id: params.packageId,
    p_channel: params.channel,
    p_channel_artifact_version_id: params.channelArtifactVersionId,
    p_scheduled_at: params.scheduledAt ?? undefined,
    p_timezone: params.timezone ?? undefined,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throwFromRpcError(error, "queue_channel");
  if (!data) throw new Error("create_queue_item returned no data");
  return data;
}

export async function rescheduleQueueItem(
  supabase: SupabaseClient<Database>,
  params: { queueItemId: string; scheduledAt: string | null; timezone: string | null }
): Promise<QueueItemRow> {
  const { data, error } = await supabase.rpc("reschedule_queue_item", {
    p_queue_item_id: params.queueItemId,
    p_scheduled_at: params.scheduledAt ?? undefined,
    p_timezone: params.timezone ?? undefined,
  });
  if (error) throwFromRpcError(error, "reschedule_queue_item");
  if (!data) throw new Error("reschedule_queue_item returned no data");
  return data;
}

export async function cancelQueueItem(
  supabase: SupabaseClient<Database>,
  params: { queueItemId: string; reason: string | null }
): Promise<QueueItemRow> {
  const { data, error } = await supabase.rpc("cancel_queue_item", {
    p_queue_item_id: params.queueItemId,
    p_reason: params.reason ?? undefined,
  });
  if (error) throwFromRpcError(error, "cancel_queue_item");
  if (!data) throw new Error("cancel_queue_item returned no data");
  return data;
}

/**
 * All queue items visible to the current session (RLS scopes this to the
 * account's own requests), for the Schedule nav
 * page (SYSTEM-DESIGN-NEXTJS.md §34.1, §34.10) rather than one request at
 * a time.
 */
export async function listQueueItemsForCurrentUser(supabase: SupabaseClient<Database>): Promise<QueueItemRow[]> {
  const { data, error } = await supabase.from("publishing_queue_items").select().order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listQueueItemsForRequest(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<QueueItemRow[]> {
  const { data, error } = await supabase
    .from("publishing_queue_items")
    .select()
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listQueueEvents(
  supabase: SupabaseClient<Database>,
  queueItemId: string
): Promise<PublishingEventRow[]> {
  const { data, error } = await supabase
    .from("publishing_events")
    .select()
    .eq("queue_item_id", queueItemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
