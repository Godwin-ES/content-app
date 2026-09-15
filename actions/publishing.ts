"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireContentManager } from "@/lib/auth/guards";
import { queueChannel, rescheduleItem, cancelItem, getPublishingQueue, type PublishingChannel } from "@/lib/publishing/service";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";
import type { Database } from "@/lib/supabase/database.types";

type QueueItemRow = Database["public"]["Tables"]["publishing_queue_items"]["Row"];

export async function queueChannelAction(
  requestId: string,
  channel: PublishingChannel,
  schedule: { scheduledAt: string; timezone: string } | null
): Promise<ActionResult<QueueItemRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const item = await queueChannel(supabase, requestId, channel, schedule);
    return { ok: true, data: item };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "queue_channel", { requestId, channel });
    return { ok: false, error: actionError };
  }
}

export async function rescheduleQueueItemAction(
  queueItemId: string,
  schedule: { scheduledAt: string; timezone: string } | null
): Promise<ActionResult<QueueItemRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const item = await rescheduleItem(supabase, queueItemId, schedule);
    return { ok: true, data: item };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "reschedule_queue_item", { queueItemId });
    return { ok: false, error: actionError };
  }
}

export async function cancelQueueItemAction(queueItemId: string, reason: string | null): Promise<ActionResult<QueueItemRow>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const item = await cancelItem(supabase, queueItemId, reason);
    return { ok: true, data: item };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "cancel_queue_item", { queueItemId });
    return { ok: false, error: actionError };
  }
}

export async function getPublishingQueueAction(requestId: string) {
  const supabase = await createSupabaseServerClient();

  try {
    await requireContentManager(supabase);
    const queue = await getPublishingQueue(supabase, requestId);
    return { ok: true as const, data: queue };
  } catch (error) {
    const actionError = await toLoggedActionError(error, "get_publishing_queue", { requestId });
    return { ok: false as const, error: actionError };
  }
}
