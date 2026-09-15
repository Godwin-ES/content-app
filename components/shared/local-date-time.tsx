"use client";

interface LocalDateTimeProps {
  value: string;
  className?: string;
}

/**
 * Renders a timestamp in the viewer's own locale/timezone. The server has
 * no reliable notion of the visiting browser's locale, so it renders the
 * raw ISO string; the client renders the localized string instead. This
 * one, expected text mismatch is deliberately suppressed via
 * `suppressHydrationWarning` — the documented React pattern for
 * locale/timezone-dependent text — rather than deferred through a
 * useEffect, which would need a setState-in-effect the lint rules flag.
 */
export function LocalDateTime({ value, className }: LocalDateTimeProps) {
  const display = typeof window === "undefined" ? value : new Date(value).toLocaleString();

  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {display}
    </time>
  );
}
