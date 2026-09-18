"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSignedIn } from "@/lib/auth/guards";
import { getAIProvider, getModelId } from "@/lib/ai/provider";
import { reviewIntake } from "@/lib/ai/service";
import { checkIntakeFields, type IntakeFlag, type IntakeValues } from "@/lib/domain/intake-checks";
import { toLoggedActionError } from "@/lib/notifications/action-error";
import type { ActionResult } from "@/lib/domain/errors";

/**
 * Checks an intake before it is submitted, and reports what looks wrong.
 *
 * Two layers, cheapest first. The deterministic checks run always and cost
 * nothing. The AI reviewer runs only over fields that survived them —
 * there is no point asking a model whether "asdfgh" is a good audience,
 * and not asking is one less call to pay for.
 *
 * Everything it returns is advisory. The form shows the flags and lets the
 * writer proceed anyway, because every judgement here is a guess about
 * subject matter the app does not know. The one exception, the keyword's
 * single-phrase rule, is marked blocking and is enforced again on create —
 * a check that only exists in an action the client chooses to call is not
 * a check at all.
 */
export async function reviewIntakeAction(values: IntakeValues & { topic: string }): Promise<ActionResult<{ flags: IntakeFlag[] }>> {
  const supabase = await createSupabaseServerClient();

  try {
    await requireSignedIn(supabase);

    const deterministic = checkIntakeFields(values);
    const alreadyFlagged = new Set(deterministic.map((flag) => flag.field));

    const remaining: IntakeValues = {
      topic: alreadyFlagged.has("topic") ? null : values.topic,
      audience: alreadyFlagged.has("audience") ? null : values.audience,
      objective: alreadyFlagged.has("objective") ? null : values.objective,
      tone: alreadyFlagged.has("tone") ? null : values.tone,
    };

    const hasAnythingLeftToReview = Object.values(remaining).some((value) => Boolean(value && value.trim()));
    if (!hasAnythingLeftToReview) return { ok: true, data: { flags: deterministic } };

    // No request exists yet, so there is no per-request model choice to
    // honour — this uses whatever the deployment's default is.
    const ai = await getAIProvider();

    const review = await reviewIntake(ai, getModelId(), {
      topic: remaining.topic ?? "",
      audience: remaining.audience ?? null,
      objective: remaining.objective ?? null,
      tone: remaining.tone ?? null,
    });

    const aiFlags: IntakeFlag[] = review.fields
      .filter((verdict) => !verdict.plausible)
      .map((verdict) => ({
        field: verdict.field,
        // A flag with no reason would be worse than no flag: the writer
        // would see a warning and have nothing to act on.
        message: verdict.reason.trim() || `${verdict.field} does not read like an answer to that question.`,
        blocking: false,
      }));

    return { ok: true, data: { flags: [...deterministic, ...aiFlags] } };
  } catch (error) {
    return { ok: false, error: await toLoggedActionError(error, "intake_review") };
  }
}
