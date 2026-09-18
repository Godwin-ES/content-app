import { requireCurrentUser } from "@/lib/auth/session";
import { DisplayNameForm } from "@/components/settings/display-name-form";

/**
 * Your account, and nothing else.
 *
 * This page used to hold notification destinations and a list of channel
 * connections. Both described a system that posts on your behalf, which
 * this one does not: the pipeline ends at a package whose contents you
 * copy into whatever actually publishes them. Settings for destinations
 * that do not exist are a promise the application cannot keep.
 */
export default async function SettingsPage() {
  const user = await requireCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account.</p>
      </div>

      <DisplayNameForm displayName={user.displayName} email={user.email} />
    </div>
  );
}
