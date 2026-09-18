import { normalizeForKeywordMatch } from "@/lib/domain/keyword";

export interface SeoCheckResult {
  key: string;
  ok: boolean;
  message: string;
}

interface ArticleSeoInput {
  title: string;
  primaryKeyword: string;
  bodyMarkdown: string;
  links: unknown[];
}

const FIRST_WORDS_WINDOW = 100;

function stripMarkdown(markdown: string): string {
  return markdown.replace(/[#*_`>[\]()]/g, " ");
}

function countHeadings(markdown: string, level: number): number {
  const pattern = new RegExp(`^#{${level}}\\s+\\S`, "gm");
  return (markdown.match(pattern) ?? []).length;
}

/**
 * Mechanical SEO checks the application enforces itself rather than
 * trusting an AI self-certification (SYSTEM-DESIGN-NEXTJS.md §16). Only
 * genuinely qualitative criteria are left to the AI evaluator (Task 13
 * evaluateArticleVersion).
 */
export function validateArticleSEO(article: ArticleSeoInput): SeoCheckResult[] {
  const h1Count = countHeadings(article.bodyMarkdown, 1);
  const h2Count = countHeadings(article.bodyMarkdown, 2);
  const keywordLower = normalizeForKeywordMatch(article.primaryKeyword);
  const titleForMatch = normalizeForKeywordMatch(article.title);

  const plainText = stripMarkdown(article.bodyMarkdown).trim();
  const firstWords = normalizeForKeywordMatch(plainText.split(/\s+/).slice(0, FIRST_WORDS_WINDOW).join(" "));

  return [
    {
      key: "single_h1",
      ok: h1Count === 1,
      message: h1Count === 1 ? "Exactly one H1." : `Found ${h1Count} H1 heading(s); exactly one is required.`,
    },
    {
      key: "keyword_in_title",
      ok: keywordLower.length > 0 && titleForMatch.includes(keywordLower),
      message:
        keywordLower.length > 0 && titleForMatch.includes(keywordLower)
          ? "Primary keyword found in title."
          : "Primary keyword is missing from the title.",
    },
    {
      key: "keyword_in_first_100_words",
      ok: keywordLower.length > 0 && firstWords.includes(keywordLower),
      message:
        keywordLower.length > 0 && firstWords.includes(keywordLower)
          ? "Primary keyword found within the first 100 words."
          : "Primary keyword does not appear within the first 100 words.",
    },
    {
      key: "has_h2",
      ok: h2Count >= 1,
      message: h2Count >= 1 ? `${h2Count} H2 section(s) found.` : "No H2 section headers found.",
    },
    {
      key: "has_relevant_links",
      ok: article.links.length >= 1,
      message: article.links.length >= 1 ? `${article.links.length} link(s) included.` : "No links included; 2-3 relevant links are recommended.",
    },
  ];
}
