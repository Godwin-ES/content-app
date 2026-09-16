"use client";

interface LocalDateTimeProps {
  value: string;
  className?: string;
  /** Omit the time-of-day, showing only the dd/mm/yyyy date. */
  dateOnly?: boolean;
}

/**
 * Fixed dd/mm/yyyy formatting everywhere a date/timestamp is shown — the
 * app previously mixed a browser-locale-dependent format here (effectively
 * mm/dd/yyyy) with raw unformatted date strings elsewhere (Source Review's
 * publication date), so the same kind of value looked different depending
 * on which screen you were on. `en-GB` is used purely as a locale that
 * happens to produce dd/mm/yyyy, not because of any actual UK-specific
 * behavior — every viewer sees the same format regardless of their own
 * browser locale.
 *
 * Still rendered client-side (the server has no reliable notion of the
 * visiting browser's timezone for the time-of-day portion), so the
 * server/client text mismatch is expected and suppressed the documented
 * React way rather than deferred through a useEffect, which would need a
 * setState-in-effect the lint rules flag.
 */
export function LocalDateTime({ value, className, dateOnly = false }: LocalDateTimeProps) {
  const display = typeof window === "undefined" ? value : formatLocalDateTime(value, dateOnly);

  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {display}
    </time>
  );
}

function formatLocalDateTime(value: string, dateOnly: boolean): string {
  const date = new Date(value);
  const datePart = date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (dateOnly) return datePart;
  const timePart = date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${timePart} ${datePart}`;
}
