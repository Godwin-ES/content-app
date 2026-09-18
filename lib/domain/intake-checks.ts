import { keywordContentWords, normalizeForKeywordMatch } from "@/lib/domain/keyword";

/**
 * Cheap, instant checks on what someone types at intake.
 *
 * Deliberately mechanical: length, shape, repetition. They catch the
 * things that are wrong no matter what the content is about — an empty-ish
 * answer, a pasted paragraph in the keyword box, a row of mashed keys —
 * without a model call, without a network round trip, and without ever
 * being wrong about a subject they know nothing about.
 *
 * Judging whether an answer is *plausible for its field* is a separate
 * job, and an AI one; see lib/ai/prompts/intake-reviewer.ts. These run
 * first because there is no point asking a model whether "asdf" is a good
 * audience.
 */

export type IntakeField = "audience" | "objective" | "tone" | "primaryKeyword" | "cta";

export interface IntakeFlag {
  field: IntakeField;
  message: string;
  /**
   * Whether the request can still be created over this flag.
   *
   * Nearly everything here is advisory: these are heuristics about someone
   * else's subject matter, and "Talent Ceiling" looks like nonsense to a
   * rule that has never heard of it. The one exception is the keyword's
   * single-phrase rule, which is not a matter of taste — the SEO check
   * looks for that exact phrase in the title, and a keyword containing a
   * comma can never be found there.
   */
  blocking: boolean;
}

/** Below this, an answer is too short to have said anything. */
const MIN_FIELD_LENGTH = 3;

/** A keyword is a phrase, not a sentence. */
const MAX_KEYWORD_WORDS = 6;

const FIELD_LABEL: Record<IntakeField, string> = {
  audience: "Audience",
  objective: "Objective",
  tone: "Tone",
  primaryKeyword: "Primary keyword",
  cta: "Call to action",
};

/** The rows someone drags a finger along when they cannot be bothered. */
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

/** The shortest run along a keyboard row that is clearly not a word. */
const KEYBOARD_WALK_LENGTH = 5;

/** "asdfgh", "qwerty", "123456" — and the same typed backwards. */
function isKeyboardWalk(word: string): boolean {
  if (word.length < KEYBOARD_WALK_LENGTH) return false;
  const reversed = [...word].reverse().join("");
  return KEYBOARD_ROWS.some((row) => row.includes(word) || row.includes(reversed));
}

/**
 * "aaaaaa", "asdfgh", "....." — input with no word in it.
 *
 * Deliberately narrow. Anything cleverer needs a dictionary, and a
 * dictionary would reject the coinages and product names this field is
 * full of. Junk that reads like language — "purple monday hiring" — is the
 * AI reviewer's job, not this one's.
 */
function looksLikeMashedKeys(value: string): boolean {
  const normalized = normalizeForKeywordMatch(value);
  if (normalized.length === 0) return true;

  const words = normalized.split(" ");
  if (words.every(isKeyboardWalk)) return true;

  // A single long run with no vowel is not a word in any language this
  // app generates in.
  if (words.length === 1 && words[0].length >= 6 && !/[aeiou]/.test(words[0])) return true;

  // One character repeated: "aaaa", "!!!!!".
  return new Set(normalized.replace(/\s/g, "")).size === 1;
}

function checkFreeText(field: IntakeField, value: string): IntakeFlag[] {
  const trimmed = value.trim();
  if (trimmed.length === 0) return [];

  const flags: IntakeFlag[] = [];

  if (trimmed.length < MIN_FIELD_LENGTH) {
    flags.push({ field, message: `${FIELD_LABEL[field]} is too short to be useful. Say a little more, or leave it blank to use the default.`, blocking: false });
  } else if (looksLikeMashedKeys(trimmed)) {
    flags.push({ field, message: `${FIELD_LABEL[field]} does not look like real words.`, blocking: false });
  }

  return flags;
}

/**
 * The primary keyword's own rules. Unlike the free-text fields, this one
 * has a downstream consumer with a literal requirement: validateArticleSEO
 * checks the title contains this exact phrase.
 */
function checkPrimaryKeyword(value: string): IntakeFlag[] {
  const trimmed = value.trim();
  if (trimmed.length === 0) return [];

  const flags: IntakeFlag[] = [];

  if (/[,;|]|\b(and|or)\b/i.test(trimmed)) {
    flags.push({
      field: "primaryKeyword",
      message: "A primary keyword is one phrase. Remove the list — pick the single phrase the article should rank for.",
      blocking: true,
    });
  }

  const words = keywordContentWords(trimmed);
  if (words.length > MAX_KEYWORD_WORDS) {
    flags.push({
      field: "primaryKeyword",
      message: `A primary keyword of ${words.length} words is a sentence, not a search. Shorten it to about ${MAX_KEYWORD_WORDS} words or fewer.`,
      blocking: true,
    });
  }

  if (words.length === 0) {
    flags.push({
      field: "primaryKeyword",
      message: "A primary keyword needs at least one meaningful word.",
      blocking: true,
    });
  } else if (looksLikeMashedKeys(trimmed)) {
    flags.push({ field: "primaryKeyword", message: "Primary keyword does not look like real words.", blocking: false });
  }

  return flags;
}

export interface IntakeValues {
  audience?: string | null;
  objective?: string | null;
  tone?: string | null;
  primaryKeyword?: string | null;
  cta?: string | null;
}

/**
 * Every deterministic flag for one intake, in field order. A blank
 * optional field is never flagged: leaving it out is a supported choice
 * that resolves to a visible default.
 */
export function checkIntakeFields(values: IntakeValues): IntakeFlag[] {
  return [
    ...checkFreeText("audience", values.audience ?? ""),
    ...checkFreeText("objective", values.objective ?? ""),
    ...checkFreeText("tone", values.tone ?? ""),
    ...checkPrimaryKeyword(values.primaryKeyword ?? ""),
    ...checkFreeText("cta", values.cta ?? ""),
  ];
}

export function blockingIntakeFlags(values: IntakeValues): IntakeFlag[] {
  return checkIntakeFields(values).filter((flag) => flag.blocking);
}
