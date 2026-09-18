import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError } from "@/lib/domain/errors";
import { throwFromRpcError } from "@/lib/supabase/rpc";








export async function setDisplayName(supabase: SupabaseClient<Database>, displayName: string): Promise<void> {
  const trimmed = displayName.trim();
  if (!trimmed) throw new DomainError("VALIDATION_ERROR", "settings", "Enter a display name.");
  const { error } = await supabase.rpc("set_display_name", { p_display_name: trimmed });
  if (error) throwFromRpcError(error, "settings");
}

/** The Discord webhook that must be matched before anything is stored. */

export interface AccountSettings {
  displayName: string;
}

export async function getAccountSettings(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AccountSettings> {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return { displayName: data.display_name };
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
