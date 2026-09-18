import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { throwFromRpcError } from "@/lib/supabase/rpc";

type ChannelConnectionRow = Database["public"]["Tables"]["channel_connections"]["Row"];

export type ConnectableChannel = "linkedin" | "x" | "newsletter";

export const CONNECTABLE_CHANNELS: ConnectableChannel[] = ["linkedin", "x", "newsletter"];

export interface ChannelConnection {
  channel: ConnectableChannel;
  accountLabel: string | null;
  accountUrl: string | null;
  recipients: string[];
  connected: boolean;
}

function toConnection(row: ChannelConnectionRow): ChannelConnection {
  return {
    channel: row.channel as ConnectableChannel,
    accountLabel: row.account_label,
    accountUrl: row.account_url,
    recipients: Array.isArray(row.recipients) ? (row.recipients as unknown as string[]) : [],
    connected: row.connected,
  };
}

/**
 * Every channel, connected or not, in a fixed order — so the settings page
 * renders three cards whether or not rows exist yet, rather than growing
 * one card at a time as they are filled in.
 */
export async function listChannelConnections(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ChannelConnection[]> {
  const { data, error } = await supabase.from("channel_connections").select().eq("user_id", userId);
  if (error) throw error;

  const byChannel = new Map((data ?? []).map((row) => [row.channel, toConnection(row)]));
  return CONNECTABLE_CHANNELS.map(
    (channel) =>
      byChannel.get(channel) ?? { channel, accountLabel: null, accountUrl: null, recipients: [], connected: false }
  );
}

export async function saveChannelConnection(
  supabase: SupabaseClient<Database>,
  userId: string,
  connection: ChannelConnection
): Promise<void> {
  const { error } = await supabase.from("channel_connections").upsert(
    {
      user_id: userId,
      channel: connection.channel,
      account_label: connection.accountLabel,
      account_url: connection.accountUrl,
      recipients: connection.recipients as unknown as Json,
      connected: connection.connected,
    },
    { onConflict: "user_id,channel" }
  );
  if (error) throw error;
}

export async function setDisplayName(supabase: SupabaseClient<Database>, displayName: string): Promise<void> {
  const trimmed = displayName.trim();
  if (!trimmed) throw new DomainError("VALIDATION_ERROR", "settings", "Enter a display name.");
  const { error } = await supabase.rpc("set_display_name", { p_display_name: trimmed });
  if (error) throwFromRpcError(error, "settings");
}

/** The Discord webhook that must be matched before anything is stored. */
export const DISCORD_WEBHOOK_PATTERN = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/;

export interface AccountSettings {
  displayName: string;
  discordWebhookUrl: string | null;
}

export async function getAccountSettings(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AccountSettings> {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, discord_webhook_url")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return { displayName: data.display_name, discordWebhookUrl: data.discord_webhook_url };
}

/**
 * Sets (or clears) the account's own Discord webhook.
 *
 * Validated here as well as in the RPC. The server makes an outbound POST
 * to whatever is stored, so anything that is not a Discord webhook
 * endpoint is a request the app should not be tricked into making on
 * someone's behalf — and a check in exactly one place is a check that can
 * be bypassed by the other caller.
 */
export async function setDiscordWebhookUrl(
  supabase: SupabaseClient<Database>,
  url: string | null
): Promise<void> {
  const trimmed = url?.trim() ?? "";
  if (trimmed && !DISCORD_WEBHOOK_PATTERN.test(trimmed)) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "settings",
      "That is not a Discord webhook URL. Copy it from Server Settings \u2192 Integrations \u2192 Webhooks; it looks like https://discord.com/api/webhooks/\u2026"
    );
  }

  const { error } = await supabase.rpc("set_discord_webhook_url", { p_url: trimmed });
  if (error) throwFromRpcError(error, "settings");
}
