import type { Database } from "@/lib/supabase/database.types";

type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];

/**
 * Each generated artifact records what it was generated *from*: an article
 * version stores the `content_plan_id` it was written against, and a
 * channel version stores the `base_article_version_id` it was adapted from.
 * Comparing those against what the request currently points at is what
 * makes downstream drift visible.
 *
 * This matters because editing is allowed at every stage. Revise the plan
 * after the articles exist and those articles are still the old plan's
 * work; pick a different article option after the channels exist and those
 * channels still speak for the option you moved away from. Nothing is
 * blocked or silently regenerated — the work stays exactly as it was, and
 * the affected stage says plainly that it no longer matches.
 */

export interface StaleNotice {
  /** What the downstream artifacts were built from, named for a reader. */
  reason: string;
  /** What to do about it. */
  action: string;
}

export function articlesStaleAgainstPlan(
  articleVersions: Array<ArtifactVersionRow | null>,
  currentPlanId: string | null
): StaleNotice | null {
  if (!currentPlanId) return null;

  const generated = articleVersions.filter((version): version is ArtifactVersionRow => Boolean(version));
  if (generated.length === 0) return null;

  // A version with no recorded plan predates the provenance column; it is
  // not evidence of drift, so it is left alone rather than reported as stale.
  const stale = generated.filter((version) => version.content_plan_id !== null && version.content_plan_id !== currentPlanId);
  if (stale.length === 0) return null;

  return {
    reason:
      stale.length === generated.length
        ? "The content plan has changed since these article options were generated."
        : `The content plan has changed since ${stale.length} of these ${generated.length} article options were generated.`,
    action: "Regenerate the affected options to write them against the current plan.",
  };
}

export function channelsStaleAgainstArticle(
  channelVersions: Array<ArtifactVersionRow | null>,
  selectedArticleVersionId: string | null
): StaleNotice | null {
  if (!selectedArticleVersionId) return null;

  const generated = channelVersions.filter((version): version is ArtifactVersionRow => Boolean(version));
  if (generated.length === 0) return null;

  const stale = generated.filter(
    (version) => version.base_article_version_id !== null && version.base_article_version_id !== selectedArticleVersionId
  );
  if (stale.length === 0) return null;

  return {
    reason:
      stale.length === generated.length
        ? "The selected article has changed since these channel assets were adapted from it."
        : `The selected article has changed since ${stale.length} of these ${generated.length} channel assets were adapted from it.`,
    action: "Regenerate the affected channels so they match the article that is now selected.",
  };
}
