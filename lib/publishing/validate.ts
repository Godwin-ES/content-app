export interface ScheduleInput {
  scheduledAt: string | null;
  timezone: string | null;
}

export interface ScheduleCheckResult {
  ok: boolean;
  message: string | null;
}

/**
 * Mirrors the RPC's own schedule validation (create_queue_item /
 * reschedule_queue_item, 008_business_rpcs.sql) so the UI can reject an
 * invalid schedule immediately instead of waiting on a round trip — the
 * RPC remains the authoritative check regardless (SYSTEM-DESIGN-NEXTJS.md
 * §25.2, §25.3).
 */
export function validateSchedule(input: ScheduleInput): ScheduleCheckResult {
  if (input.scheduledAt === null) {
    return { ok: true, message: null };
  }

  const parsed = new Date(input.scheduledAt);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: "Scheduled time is not a valid date/time." };
  }
  if (parsed.getTime() <= Date.now()) {
    return { ok: false, message: "Scheduled time must be in the future." };
  }
  if (!input.timezone || input.timezone.trim().length === 0) {
    return { ok: false, message: "A timezone is required for a scheduled item." };
  }

  return { ok: true, message: null };
}
