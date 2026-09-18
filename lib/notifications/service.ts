import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendDiscordMessage } from "@/lib/notifications/discord";
import { getInjectedFailureMode } from "@/lib/test-support/failure-injection";

/**
 * Which Discord channel a notification goes to. "content_manager" is a
 * historical name kept because it is a stored value in
 * notification_attempts.channel: with one role, it simply means the
 * owner's own channel.
 */
type NotificationChannel = "content_manager" | "system_errors";

/**
 * The webhook a request's notifications should go to: the owner's own, if
 * they have set one in settings, otherwise the deployment's.
 *
 * Read with the admin client because notifications are sent from server
 * code that has no session — the pipeline, a best-effort side effect after
 * an action has already returned. A webhook is only ever resolved from a
 * request the notification is about, so nothing can be addressed to an
 * account that has nothing to do with it.
 *
 * Returns undefined rather than throwing on any failure. This lookup is
 * the means of delivering a notification, not part of it: a database blip
 * here should fall back to the deployment's webhook, not silently discard
 * a message about something that did happen.
 */
async function ownerWebhookUrl(requestId: string | null): Promise<string | undefined> {
  if (!requestId) return undefined;

  try {
    const admin = createSupabaseAdminClient();
    const { data: request } = await admin.from("content_requests").select("owner_id").eq("id", requestId).maybeSingle();
    if (!request) return undefined;

    const { data: profile } = await admin
      .from("profiles")
      .select("discord_webhook_url")
      .eq("user_id", request.owner_id)
      .maybeSingle();

    return profile?.discord_webhook_url ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sends a Discord message for one channel/event, and records whether the
 * supplementary notification was sent, failed, or skipped
 * (SYSTEM-DESIGN-NEXTJS.md §28.2, §28.4). Never throws: the workflow must
 * never depend on Discord delivery for correctness, so callers can treat
 * this as fire-and-forget (wrap with bestEffort() at the call site as
 * additional defense in depth per the plan).
 */
async function notify(params: {
  requestId: string | null;
  channel: NotificationChannel;
  eventType: string;
  webhookUrl: string | undefined;
  message: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  let status: "sent" | "failed" | "skipped" = "skipped";
  let error: string | null = null;

  // The account's own webhook wins over the deployment's, so notifications
  // about your content reach your Discord rather than the operator's.
  const webhookUrl = (await ownerWebhookUrl(params.requestId)) ?? params.webhookUrl;

  const injectedMode = await getInjectedFailureMode();
  if (injectedMode === "notification_failure") {
    status = "failed";
    error = "Injected failure: notification_failure";
  } else if (webhookUrl) {
    try {
      await sendDiscordMessage(webhookUrl, params.message);
      status = "sent";
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message : String(err);
    }
  }

  await admin.from("notification_attempts").insert({
    request_id: params.requestId,
    channel: params.channel,
    event_type: params.eventType,
    status,
    error,
  });
}

/**
 * A package cleared the approval gate and can now be queued. The one
 * notification worth sending about a decision you made yourself: it is the
 * point at which content becomes publishable, and it is worth a record
 * outside the app.
 */
export async function notifyPackageApproved(params: { requestId: string; topic: string }): Promise<void> {
  await notify({
    requestId: params.requestId,
    channel: "content_manager",
    eventType: "package_approved",
    webhookUrl: process.env.DISCORD_CONTENT_WEBHOOK_URL,
    message: `**${params.topic}** was approved and is ready to queue.`,
  });
}

/**
 * The research finished, but nothing it found discusses the keyword the
 * article is supposed to rank for. Sent to the Content Manager's channel
 * rather than the system-errors one: nothing malfunctioned, and the person
 * who can fix it — by changing the keyword or adding a source — is the one
 * who needs to hear about it.
 */
export async function notifyKeywordCoverageGap(params: {
  requestId: string;
  topic: string;
  keyword: string;
  blocking: boolean;
}): Promise<void> {
  const suffix = params.blocking
    ? "The source set cannot be confirmed until the keyword matches the research, or a source covering it is added."
    : "The supplied materials are yours to judge, so this is only a warning.";

  await notify({
    requestId: params.requestId,
    channel: "content_manager",
    eventType: "keyword_coverage_gap",
    webhookUrl: process.env.DISCORD_CONTENT_WEBHOOK_URL,
    message: `No source for **${params.topic}** mentions its primary keyword "${params.keyword}". ${suffix}`,
  });
}

export async function notifySystemError(params: {
  stage: string;
  message: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  await notify({
    requestId: typeof params.context?.requestId === "string" ? (params.context.requestId as string) : null,
    channel: "system_errors",
    eventType: "system_error",
    webhookUrl: process.env.DISCORD_ERRORS_WEBHOOK_URL,
    message: `Unexpected system error at **${params.stage}**: ${params.message}`,
  });
}
