import { z } from "zod";

/**
 * Article Writer output (SYSTEM-DESIGN-NEXTJS.md §15). The claim ledger is
 * internal (never shown raw in the public article) and lets the grounding
 * validator and evaluator check every factual/inference claim against
 * supplied evidence IDs.
 */
export const articleClaimSchema = z.object({
  claimId: z.string().min(1),
  claimType: z.enum(["factual", "inference", "editorial"]),
  claimText: z.string().min(1),
  evidenceIds: z.array(z.string()).default([]),
  articleSection: z.string().min(1),
});

export const articleLinkSchema = z.object({
  url: z.string().min(1),
  label: z.string().min(1),
});

/**
 * A named body section (Phase 4 of the post-Task-22 UX pass) — the article
 * used to be one undivided `bodyMarkdown` string, so there was no
 * addressable unit to target an "edit this part" or "regenerate this part"
 * action at, unlike the content plan's own sections or the newsletter's
 * named fields. Mirrors the plan's section shape (heading/level/body) so
 * the same per-section edit/regenerate pattern applies uniformly.
 */
export const articleSectionSchema = z.object({
  heading: z.string().min(1),
  level: z.enum(["h2", "h3"]),
  bodyMarkdown: z.string().min(1),
});

export const articleSchema = z.object({
  insufficientEvidence: z.boolean().default(false),
  insufficientEvidenceReason: z.string().nullable().default(null),
  title: z.string().min(1),
  metaDescription: z.string().min(1),
  primaryKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string()).default([]),
  sections: z.array(articleSectionSchema).min(1),
  links: z.array(articleLinkSchema).default([]),
  claims: z.array(articleClaimSchema).default([]),
});

export type ArticleClaim = z.infer<typeof articleClaimSchema>;
export type ArticleLink = z.infer<typeof articleLinkSchema>;
export type ArticleSection = z.infer<typeof articleSectionSchema>;
export type ArticleOutput = z.infer<typeof articleSchema>;

/**
 * Flattens an article's title and sections into one markdown string — for
 * whatever still genuinely needs one (the "exactly one H1"/keyword-in-
 * title SEO scan, the evaluator/reviser prompts, a channel adapter's
 * source text). The title becomes the H1; the UI never renders this
 * combined string directly (title and sections are displayed separately,
 * each their own element), so there is no risk of the H1 showing twice.
 */
export function articleBodyMarkdown(article: StoredArticle): string {
  if (!article.sections?.length) {
    // Pre-sections article: its stored markdown already opens with its own
    // H1, so it is returned untouched rather than given a second one.
    return article.bodyMarkdown ?? "";
  }
  const body = article.sections.map((s) => `${s.level === "h2" ? "##" : "###"} ${s.heading}\n\n${s.bodyMarkdown}`).join("\n\n");
  return `# ${article.title}\n\n${body}`;
}

/**
 * An article as it may actually be found in the database. `artifact_versions`
 * and an approved package's `snapshot` are both immutable by design — they
 * are never rewritten, so every article written before the move to
 * `sections` is still stored as one `bodyMarkdown` string and always will
 * be. Readers therefore have to handle both shapes; this is a property of
 * an append-only store, not a migration that was skipped.
 */
export interface StoredArticle {
  title: string;
  sections?: ArticleSection[];
  bodyMarkdown?: string;
}

const HEADING_LINE = /^(#{2,3})\s+(.+?)\s*$/;

/**
 * The article's sections, deriving them from the markdown for a
 * pre-sections article so per-section edit/regenerate works on old content
 * too. Splitting on H2/H3 recovers the structure the writer originally
 * produced; anything before the first heading (typically the H1 and a
 * standfirst) is kept as an opening section rather than dropped.
 */
export function articleSections(article: StoredArticle): ArticleSection[] {
  if (article.sections?.length) return article.sections;
  if (!article.bodyMarkdown) return [];

  const sections: ArticleSection[] = [];
  let heading: string | null = null;
  let level: "h2" | "h3" = "h2";
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    buffer = [];
    if (!heading) {
      // Preamble: keep it, minus the duplicate H1, under the article title.
      const withoutH1 = body.replace(/^#\s+.+$/m, "").trim();
      if (withoutH1) sections.push({ heading: article.title, level: "h2", bodyMarkdown: withoutH1 });
      return;
    }
    sections.push({ heading, level, bodyMarkdown: body || "—" });
  };

  for (const line of article.bodyMarkdown.split("\n")) {
    const match = HEADING_LINE.exec(line);
    if (!match) {
      buffer.push(line);
      continue;
    }
    flush();
    level = match[1].length === 2 ? "h2" : "h3";
    heading = match[2];
  }
  flush();

  return sections.length > 0 ? sections : [{ heading: article.title, level: "h2", bodyMarkdown: article.bodyMarkdown }];
}
