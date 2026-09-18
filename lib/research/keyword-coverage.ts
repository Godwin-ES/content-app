/**
 * Does the evidence actually cover the keyword the article is meant to
 * rank for?
 *
 * The pipeline could previously produce a perfectly healthy-looking source
 * set — eight usable sources, no conflicts, every check green — that never
 * once discussed the keyword. Everything downstream then inherited the
 * mismatch: the plan was built from those sources, the article was written
 * from that plan, and the first sign of trouble was the deterministic SEO
 * check failing on the finished article, hours of generation later. This
 * moves that discovery to the moment the sources are reviewed, which is the
 * last point where fixing it is cheap.
 *
 * Pure and text-only: no AI call, because "does this text contain these
 * words" does not need one, and a check meant to catch a bad generation
 * should not itself depend on a generation.
 */

import { keywordContentWords, normalizeForKeywordMatch, textCoversKeyword } from "@/lib/domain/keyword";

export interface KeywordCoverageSource {
  id: string;
  title: string | null;
  extractedText: string | null;
  origin: "researched" | "user_url" | "uploaded_material";
}

export interface KeywordCoverage {
  /** The keyword assessed, or null when the request has none yet. */
  keyword: string | null;
  /** False when there was nothing to assess — no keyword, or no sources. */
  assessed: boolean;
  /** Sources containing the keyword phrase itself. */
  phraseMatchIds: string[];
  /** Sources containing every content word of the keyword, but not the phrase. */
  termMatchIds: string[];
  covered: boolean;
  /** True when the reviewed evidence is entirely the user's own material. */
  suppliedOnly: boolean;
  /**
   * Whether a failure should stop the source set being confirmed. Sources
   * the user chose themselves are their call to make: they know why that
   * material is relevant, and second-guessing it would make the check an
   * obstacle rather than a safeguard. Sources the system found are its own
   * work, and it should not pass off evidence that misses the point.
   */
  blocking: boolean;
  message: string;
}

/**
 * Assesses whether any of the given sources mentions the primary keyword.
 * Callers pass the sources that will actually inform the article — the
 * accepted ones at source review — not every candidate retrieved.
 */
export function assessKeywordCoverage(keyword: string | null, sources: KeywordCoverageSource[]): KeywordCoverage {
  const words = keyword ? keywordContentWords(keyword) : [];
  const suppliedOnly = sources.length > 0 && sources.every((s) => s.origin !== "researched");

  if (!keyword || words.length === 0 || sources.length === 0) {
    return {
      keyword,
      assessed: false,
      phraseMatchIds: [],
      termMatchIds: [],
      covered: true,
      suppliedOnly,
      blocking: false,
      message: keyword
        ? "No sources to check the primary keyword against yet."
        : "No primary keyword set, so there is nothing to check coverage against.",
    };
  }

  const phrase = words.join(" ");
  const phraseMatchIds: string[] = [];
  const termMatchIds: string[] = [];

  for (const source of sources) {
    const haystack = normalizeForKeywordMatch(`${source.title ?? ""} ${source.extractedText ?? ""}`);
    if (haystack.length === 0) continue;

    if (haystack.includes(phrase)) {
      phraseMatchIds.push(source.id);
    } else if (textCoversKeyword(haystack, keyword)) {
      termMatchIds.push(source.id);
    }
  }

  const covered = phraseMatchIds.length > 0 || termMatchIds.length > 0;
  const blocking = !covered && !suppliedOnly;

  return {
    keyword,
    assessed: true,
    phraseMatchIds,
    termMatchIds,
    covered,
    suppliedOnly,
    blocking,
    message: describe(keyword, phraseMatchIds.length, termMatchIds.length, suppliedOnly),
  };
}

function describe(keyword: string, phraseCount: number, termCount: number, suppliedOnly: boolean): string {
  if (phraseCount > 0) {
    return phraseCount === 1
      ? `1 source uses the phrase "${keyword}".`
      : `${phraseCount} sources use the phrase "${keyword}".`;
  }
  if (termCount > 0) {
    return (
      `No source uses the exact phrase "${keyword}", but ${termCount} ` +
      `mention${termCount === 1 ? "s" : ""} all of its terms. The article can still be written around it.`
    );
  }
  return suppliedOnly
    ? `None of the supplied materials mention "${keyword}". They are yours, so this is only a warning — ` +
        `but the article will be written from evidence that does not discuss the keyword it is meant to rank for.`
    : `No usable source mentions "${keyword}". Writing the article from this evidence would mean claiming ` +
        `authority on a keyword none of it discusses. Change the primary keyword to match what the research ` +
        `actually found, or add a source that covers it, then confirm again.`;
}
