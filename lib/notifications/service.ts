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
 * Sends a Discord message for one role-specific channel/event, and records
 * whether the supplementary notification was sent, failed, or skipped
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

  const injectedMode = await getInjectedFailureMode();
  if (injectedMode === "notification_failure") {
    status = "failed";
    error = "Injected failure: notification_failure";
  } else if (params.webhookUrl) {
    try {
      await sendDiscordMessage(params.webhookUrl, params.message);
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
