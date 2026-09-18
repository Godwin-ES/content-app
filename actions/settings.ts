"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import { saveChannelConnection, setDisplayName, type ChannelConnection } from "@/lib/repositories/settings";
import { parseUserSuppliedUrl } from "@/lib/research/url";
import { DomainError } from "@/lib/domain/errors";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function setDisplayNameAction(displayName: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);
    await setDisplayName(supabase, displayName);
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: await toLoggedActionError(error, "settings") };
  }
}

/**
 * Saves where one channel's approved content is destined.
 *
 * Validation happens here rather than in the database because the rules
 * differ per channel — a newsletter needs recipients, a social account
 * needs a link — and a check constraint expressive enough to say that
 * would be far harder to read than this.
 */
export async function saveChannelConnectionAction(connection: ChannelConnection): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  try {
    const user = await requireSignedIn(supabase);

    const label = connection.accountLabel?.trim() || null;
    const recipients = connection.recipients.map((r) => r.trim()).filter((r) => r.length > 0);

    let url: string | null = null;
    if (connection.accountUrl?.trim()) {
      url = parseUserSuppliedUrl(connection.accountUrl);
      if (!url) {
        throw new DomainError("VALIDATION_ERROR", "settings", `"${connection.accountUrl}" is not a valid web address.`);
      }
    }

    if (connection.connected) {
      if (connection.channel === "newsletter") {
        if (recipients.length === 0) {
          throw new DomainError("VALIDATION_ERROR", "settings", "Add at least one recipient before connecting the newsletter.");
        }
        const invalid = recipients.find((r) => !EMAIL_PATTERN.test(r));
        if (invalid) {
          throw new DomainError("VALIDATION_ERROR", "settings", `"${invalid}" is not a valid email address.`);
        }
      } else if (!label) {
        throw new DomainError("VALIDATION_ERROR", "settings", "Add the account name before connecting this channel.");
      }
    }

    await saveChannelConnection(supabase, user.userId, {
      channel: connection.channel,
      accountLabel: label,
      accountUrl: url,
      recipients,
      connected: connection.connected,
    });

    revalidatePath("/settings");
    revalidatePath("/publishing");
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: await toLoggedActionError(error, "settings") };
  }
}
