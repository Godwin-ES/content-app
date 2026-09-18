import { requireCurrentUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listChannelConnections, getAccountSettings } from "@/lib/repositories/settings";
import { DisplayNameForm } from "@/components/settings/display-name-form";
import { ChannelConnectionCard } from "@/components/settings/channel-connection-card";
import { DiscordWebhookForm } from "@/components/settings/discord-webhook-form";

/**
 * Account and destinations. There is one account, so there is no user
 * administration here — only who you are and where approved content goes.
 */
export default async function SettingsPage() {
  const user = await requireCurrentUser();
  const supabase = await createSupabaseServerClient();
  const [connections, account] = await Promise.all([
    listChannelConnections(supabase, user.userId),
    getAccountSettings(supabase, user.userId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account, where you are notified, and where approved content is published.</p>
      </div>

      <DisplayNameForm displayName={user.displayName} email={user.email} />

      <DiscordWebhookForm webhookUrl={account.discordWebhookUrl} />

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium">Channels</h2>
          <p className="text-sm text-muted-foreground">
            Approved content is queued for these destinations. Koya does not post on your behalf yet — the queue records what
            is ready, for whom, and when it is scheduled.
          </p>
        </div>
        {connections.map((connection) => (
          <ChannelConnectionCard key={connection.channel} connection={connection} />
        ))}
      </div>
    </div>
  );
}
