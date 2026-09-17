import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendDiscordMessage } from "@/lib/notifications/discord";
import { getInjectedFailureMode } from "@/lib/test-support/failure-injection";
import type { ReviewDecision } from "@/lib/domain/types";

type NotificationChannel = "content_manager" | "reviewer" | "system_errors";

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

export async function notifyReviewerSubmission(params: { requestId: string; topic: string }): Promise<void> {
  await notify({
    requestId: params.requestId,
    channel: "reviewer",
    eventType: "package_submitted",
    webhookUrl: process.env.DISCORD_REVIEW_WEBHOOK_URL,
    message: `New package submitted for review: **${params.topic}**`,
  });
}

export async function notifyReviewerWithdrawal(params: { requestId: string; topic: string }): Promise<void> {
  await notify({
    requestId: params.requestId,
    channel: "reviewer",
    eventType: "package_withdrawn",
    webhookUrl: process.env.DISCORD_REVIEW_WEBHOOK_URL,
    message: `Submission withdrawn: **${params.topic}**`,
  });
}

export async function notifyContentManagerDecision(params: {
  requestId: string;
  topic: string;
  decision: ReviewDecision;
  comment: string | null;
}): Promise<void> {
  const decisionLabel =
    params.decision === "approved" ? "approved" : "sent back for changes";
  const commentSuffix = params.comment ? `\n> ${params.comment}` : "";

  await notify({
    requestId: params.requestId,
    channel: "content_manager",
    eventType: "package_review_decided",
    webhookUrl: process.env.DISCORD_CONTENT_WEBHOOK_URL,
    message: `**${params.topic}** was ${decisionLabel}.${commentSuffix}`,
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
