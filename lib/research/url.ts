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
