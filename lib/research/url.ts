const TRACKING_PARAM_PATTERNS: RegExp[] = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^msclkid$/i,
  /^mc_eid$/i,
  /^mc_cid$/i,
  /^igshid$/i,
  /^ref_src$/i,
  /^ref$/i,
  /^spm$/i,
];

/**
 * Accepts a link as a person would actually paste it and returns a full
 * absolute URL, or null if it could not be one. `new URL()` alone rejects
 * "example.com/article" outright, which surfaced as an unhandled TypeError
 * and a generic "Something unexpected happened" toast rather than an
 * answerable message — so a missing scheme is filled in instead of failing.
 */
export function parseUserSuppliedUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // A bare word ("notes", "localhost") parses fine but is never a source.
    if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Collapses tracking-parameter variants of the same article into one
 * canonical URL and normalizes formatting differences that do not change
 * the resource (SYSTEM-DESIGN-NEXTJS.md §9.5). Deterministic: two URLs that
 * resolve to the same canonical form always produce byte-identical output.
 */
export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  const params = new URLSearchParams(url.search);
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key))) {
      params.delete(key);
    }
  }
  const sortedEntries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of sortedEntries) {
    url.searchParams.append(key, value);
  }

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function dedupeByCanonicalUrl<T extends { canonicalUrl: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.canonicalUrl)) continue;
    seen.add(item.canonicalUrl);
    result.push(item);
  }
  return result;
}
