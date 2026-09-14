export interface UsefulContentCheck {
  usable: boolean;
  reason: string | null;
}

const MIN_MEANINGFUL_LENGTH = 200;
const BOILERPLATE_THRESHOLD_LENGTH = 600;
const MIN_SENTENCE_COUNT = 3;

const BOILERPLATE_MARKERS = [
  "accept cookies",
  "accept all cookies",
  "cookie policy",
  "please log in",
  "sign in to continue",
  "enable javascript",
  "subscribe to continue reading",
  "403 forbidden",
  "404 not found",
  "access denied",
  "page could not be found",
  "you need to enable javascript",
];

/**
 * Deterministic first gate for whether a retrieved page is usable evidence
 * (SYSTEM-DESIGN-NEXTJS.md §9.4). HTTP 200 does not mean useful content:
 * navigation, cookie notices, login walls, and error pages must not become
 * apparent evidence. Heuristic, not AI-based, by design.
 */
export function validateUsefulContent(markdown: string): UsefulContentCheck {
  const trimmed = markdown.trim();

  if (trimmed.length < MIN_MEANINGFUL_LENGTH) {
    return { usable: false, reason: "Page content is too short to be useful (likely boilerplate or an error page)." };
  }

  const lower = trimmed.toLowerCase();
  const boilerplateHit = BOILERPLATE_MARKERS.find((marker) => lower.includes(marker));
  if (boilerplateHit && trimmed.length < BOILERPLATE_THRESHOLD_LENGTH) {
    return { usable: false, reason: `Page appears to be boilerplate, login, or error content ("${boilerplateHit}").` };
  }

  const sentenceCount = (trimmed.match(/[.!?](\s|$)/g) ?? []).length;
  if (sentenceCount < MIN_SENTENCE_COUNT) {
    return { usable: false, reason: "Page does not contain enough substantive sentence content." };
  }

  return { usable: true, reason: null };
}
