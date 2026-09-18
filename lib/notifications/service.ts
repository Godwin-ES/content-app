import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendDiscordMessage } from "@/lib/notifications/discord";

/**
 * Which Discord channel a notification goes to. "content_manager" is a
 * historical name kept because it is a stored value in
 * notification_attempts.channel: with one role, it simply means the
 * owner's own channel.
 */
type NotificationChannel = "content_manager" | "system_errors";

/**
 * A link straight to the part of the app a notification is about.
 *
 * A notification that says something happened and leaves you to find it is
 * half a notification — and these arrive while you are elsewhere, which is
 * the whole reason for sending them.
 */
function requestUrl(requestId: string, tab?: string): string {
  const origin = process.env.APP_URL ?? "http://localhost:3000";
  return `${origin}/requests/${requestId}${tab ? `?tab=${tab}` : ""}`;
}

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
async function webhookForUser(userId: string): Promise<string | undefined> {
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("discord_webhook_url")
    .eq("user_id", userId)
    .maybeSingle();
  return profile?.discord_webhook_url ?? undefined;
}

/**
 * The webhook a notification should go to: the one set in Settings by the
 * person it concerns.
 *
 * Resolved from the request's owner where there is a request, and from
 * whoever is signed in where there is not — an unexpected error outside a
 * request still belongs to the person who hit it. There is no environment
 * fallback: every notification this app sends is about someone's own
 * content, and a deployment-wide webhook would send it to the wrong place.
 *
 * Returns undefined rather than throwing on any failure. This lookup is
 * the means of delivering a notification, not part of it: a database blip
 * here should skip the message, not take down the operation that prompted
 * it.
 */
async function resolveWebhookUrl(requestId: string | null): Promise<string | undefined> {
  try {
    if (requestId) {
      const admin = createSupabaseAdminClient();
      const { data: request } = await admin.from("content_requests").select("owner_id").eq("id", requestId).maybeSingle();
      if (request) return await webhookForUser(request.owner_id);
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? await webhookForUser(user.id) : undefined;
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
  message: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  let status: "sent" | "failed" | "skipped" = "skipped";
  let error: string | null = null;

  const webhookUrl = await resolveWebhookUrl(params.requestId);

  if (webhookUrl) {
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
    message: `✅ **${params.topic}** — approved and ready to queue.\n${requestUrl(params.requestId, "package")}`,
  });
}

/**
 * One completed step of an auto-mode run.
 *
 * Auto mode is the case where notifications earn their place: the run takes
 * minutes, does seven or eight things in a row, and the whole point is that
 * nobody is sitting over it. Working by hand needs none of this — you are
 * already looking at the thing that just happened, and a Discord message
 * about a button you pressed a second ago is noise.
 *
 * Deliberately brief: what it is, what just finished, and a link to the
 * tab where it landed.
 */
export async function notifyAutoModeStep(params: {
  requestId: string;
  topic: string;
  stage: string;
  detail: string;
  tab: string;
  blocked?: boolean;
}): Promise<void> {
  const mark = params.blocked ? "⏸️" : "▸";
  await notify({
    requestId: params.requestId,
    channel: "content_manager",
    eventType: params.blocked ? "auto_mode_blocked" : "auto_mode_step",
    message:
      `${mark} **${params.topic}** — ${params.stage}\n${params.detail}\n` +
      `${requestUrl(params.requestId, params.tab)}`,
  });
}

/** An auto-mode run reached the end of what it is allowed to do. */
export async function notifyAutoModeFinished(params: {
  requestId: string;
  topic: string;
  detail: string;
}): Promise<void> {
  await notify({
    requestId: params.requestId,
    channel: "content_manager",
    eventType: "auto_mode_finished",
    message: `🏁 **${params.topic}** — auto mode finished.\n${params.detail}\n${requestUrl(params.requestId, "package")}`,
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
    message:
      `⚠️ **${params.topic}** — no source mentions the primary keyword "${params.keyword}".\n${suffix}\n` +
      `${requestUrl(params.requestId, "research")}`,
  });
}

export async function notifySystemError(params: {
  stage: string;
  message: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  const requestId = typeof params.context?.requestId === "string" ? (params.context.requestId as string) : null;

  await notify({
    requestId,
    channel: "system_errors",
    eventType: "system_error",
    message: `🛑 Something went wrong at **${params.stage}**: ${params.message}${requestId ? `\n${requestUrl(requestId)}` : ""}`,
  });
}
