/**
 * Platform constraints enforced deterministically, not left to the model's
 * self-report (SYSTEM-DESIGN-NEXTJS.md §21, §22 — mirrors the SEO-checks
 * precedent from lib/seo/validate.ts).
 */
export const NEWSLETTER_MIN_WORDS = 250;
export const NEWSLETTER_MAX_WORDS = 600;
export const X_MAX_HASHTAGS = 2;
