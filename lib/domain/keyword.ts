/**
 * One normalization for keyword matching, shared by everything that
 * compares a keyword to text.
 *
 * It used to be copied into lib/seo/validate.ts and
 * lib/research/keyword-coverage.ts, each with a comment promising the two
 * were identical. Two copies of a promise is not a guarantee: if they ever
 * drifted, a source set accepted at research could be failed by the SEO
 * check on the finished article, for no reason a reader could see.
 */

/**
 * Lowercases and flattens the punctuation that separates words, so
 * "four-day work week" matches "Four Day Work Week".
 *
 * It deliberately does NOT reorder or drop words. The SEO spec requires
 * the primary keyword itself in the title, and a title that merely reuses
 * its words scattered around ("AI Agents Are Transforming Recruiting" for
 * "AI agents in recruiting") has not met that.
 */
export function normalizeForKeywordMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Words too common to carry meaning in a keyword phrase. Left out of
 * word-level matching so "AI agents in recruiting" is not judged covered
 * merely because some text contains the word "in".
 */
export const KEYWORD_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "for",
  "of",
  "in",
  "on",
  "to",
  "with",
  "at",
  "by",
  "or",
  "your",
  "how",
]);

/** The meaning-carrying words of a keyword phrase, normalized. */
export function keywordContentWords(keyword: string): string[] {
  return normalizeForKeywordMatch(keyword)
    .split(" ")
    .filter((word) => word.length > 0 && !KEYWORD_STOP_WORDS.has(word));
}

/**
 * Whether `text` contains the keyword as a phrase. Both sides are
 * normalized first, so spelling the phrase with different punctuation
 * still matches.
 */
export function textContainsKeyword(text: string, keyword: string): boolean {
  const phrase = normalizeForKeywordMatch(keyword);
  if (phrase.length === 0) return false;
  return normalizeForKeywordMatch(text).includes(phrase);
}

/**
 * Whether `text` is about the keyword — either the phrase itself, or every
 * meaningful word of it present separately.
 *
 * Looser than `textContainsKeyword` on purpose. A search query of "ai
 * agents recruiting" is unmistakably looking for "ai agents in recruiting",
 * and rejecting it over a missing "in" would fail real work for no reason.
 * The strict phrase rule is kept for the SEO title check, where the literal
 * phrase genuinely is the requirement.
 *
 * Content words are matched as whole words rather than substrings: "ai" as
 * a substring appears in "training", "detail" and "email", which would make
 * any short keyword match almost anything.
 */
export function textCoversKeyword(text: string, keyword: string): boolean {
  if (textContainsKeyword(text, keyword)) return true;

  const words = keywordContentWords(keyword);
  if (words.length === 0) return false;

  const present = new Set(normalizeForKeywordMatch(text).split(" "));
  return words.every((word) => present.has(word));
}
