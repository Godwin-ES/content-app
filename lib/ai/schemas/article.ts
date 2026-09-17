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
export function articleBodyMarkdown(article: { title: string; sections: ArticleSection[] }): string {
  const body = article.sections.map((s) => `${s.level === "h2" ? "##" : "###"} ${s.heading}\n\n${s.bodyMarkdown}`).join("\n\n");
  return `# ${article.title}\n\n${body}`;
}
