/**
 * Which activity events are worth a Content Manager's attention.
 *
 * `activity_events` is the full audit trail and stays that way — every row
 * is still written and still queryable. This is only about what the
 * workspace *shows*, and the trail contains three kinds of noise for a
 * reader:
 *
 * - `artifact_version_created` fires once per artifact from the RPC, so
 *   generating three article options wrote three near-identical rows on top
 *   of the `article_options_generated` summary that already said "3 of 3".
 *   Every path that creates a version also records a more specific event
 *   (generated / revised / manually edited), so the per-version row never
 *   carries information the summary lacks.
 * - `research_retrieval_completed` ("8 usable sources found") and
 *   `ready_for_source_review` restate what the Research tab shows directly,
 *   at the moment the reader is looking at it.
 *
 * What remains is the list of things someone actually did or that the
 * system produced: creations, edits, selections, submissions, and reviewer
 * feedback — plus failures, which are rare and never noise.
 */
const SHOWN_EVENT_TYPES = new Set([
  // Creation and generation
  "request_created",
  "research_plan_created",
  "content_plan_created",
  "article_options_generated",
  "channel_assets_generated",
  "article_revised",
  "package_created",
  // Edits
  "article_manually_edited",
  "article_targeted_revision_applied",
  "channel_manually_edited",
  // Selections and decisions
  "source_set_confirmed",
  "article_selected",
  // Submissions and reviewer feedback
  "package_submitted",
  "package_withdrawn",
  "package_review_decided",
  // Failures
  "system_error",
]);

export function isDisplayedActivityEvent(eventType: string): boolean {
  return SHOWN_EVENT_TYPES.has(eventType);
}

export function filterDisplayedActivity<T extends { event_type: string }>(events: T[]): T[] {
  return events.filter((event) => isDisplayedActivityEvent(event.event_type));
}
