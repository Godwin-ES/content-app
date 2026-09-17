"use client";

import { useSyncExternalStore } from "react";

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
 * Server and hydration renders format in UTC so both produce byte-identical
 * text; only once hydration has finished does it re-format in the viewer's
 * own timezone. An earlier version instead rendered the raw ISO string on
 * the server and relied on `suppressHydrationWarning` to paper over the
 * difference — but that attribute tells React to *skip* patching the text,
 * so the raw `2026-09-15T18:33:21.349785+00:00` stayed on screen for good
 * and the formatting never actually applied anywhere.
 */
const subscribe = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

export function LocalDateTime({ value, className, dateOnly = false }: LocalDateTimeProps) {
  const hydrated = useSyncExternalStore(subscribe, getHydratedSnapshot, getServerSnapshot);

  return (
    <time dateTime={value} className={className}>
      {formatLocalDateTime(value, dateOnly, hydrated ? undefined : "UTC")}
    </time>
  );
}

export function formatLocalDateTime(value: string, dateOnly: boolean, timeZone?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const datePart = date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone });
  if (dateOnly) return datePart;

  const timePart = date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone });
  return `${timePart} ${datePart}`;
}
