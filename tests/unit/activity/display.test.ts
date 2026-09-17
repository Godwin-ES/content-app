import { describe, expect, it } from "vitest";
import { filterDisplayedActivity } from "@/lib/activity/display";

/**
 * Taken from a real request's trail, in order, so the expectations below
 * describe an actual feed rather than an invented one.
 */
const REAL_TRAIL = [
  { event_type: "request_created", message: "Request created: How AI agents are changing recruiting workflows" },
  { event_type: "research_plan_created", message: "Research plan created (6 search queries)" },
  { event_type: "research_retrieval_completed", message: "8 usable sources found" },
  { event_type: "ready_for_source_review", message: "Ready for Source Review" },
  { event_type: "source_set_confirmed", message: "Source Set v1 confirmed" },
  { event_type: "content_plan_created", message: "Content plan v1 created" },
  { event_type: "artifact_version_created", message: "article v1 created (initial_generation)" },
  { event_type: "artifact_version_created", message: "article v1 created (initial_generation)" },
  { event_type: "artifact_version_created", message: "article v1 created (initial_generation)" },
  { event_type: "article_options_generated", message: "3 of 3 article option(s) generated" },
  { event_type: "article_selected", message: "Option A selected" },
  { event_type: "artifact_version_created", message: "x v1 created (channel_adaptation)" },
  { event_type: "artifact_version_created", message: "newsletter v1 created (channel_adaptation)" },
  { event_type: "artifact_version_created", message: "linkedin v1 created (channel_adaptation)" },
  { event_type: "channel_assets_generated", message: "3 of 3 channel asset(s) generated" },
  { event_type: "package_created", message: "Package v1 created" },
  { event_type: "package_submitted", message: "Package submitted for approval" },
];

describe("filterDisplayedActivity", () => {
  it("collapses a real trail to what someone actually did", () => {
    expect(filterDisplayedActivity(REAL_TRAIL).map((e) => e.message)).toEqual([
      "Request created: How AI agents are changing recruiting workflows",
      "Research plan created (6 search queries)",
      "Source Set v1 confirmed",
      "Content plan v1 created",
      "3 of 3 article option(s) generated",
      "Option A selected",
      "3 of 3 channel asset(s) generated",
      "Package v1 created",
      "Package submitted for approval",
    ]);
  });

  it("drops the per-artifact rows that the generation summaries already cover", () => {
    // Six near-identical rows for two bulk generations, replaced by the two
    // summaries that say "3 of 3".
    expect(REAL_TRAIL.filter((e) => e.event_type === "artifact_version_created")).toHaveLength(6);
    expect(filterDisplayedActivity(REAL_TRAIL).some((e) => e.event_type === "artifact_version_created")).toBe(false);
  });

  it("keeps edits, reviewer feedback and failures", () => {
    const events = [
      { event_type: "article_manually_edited", message: "edited" },
      { event_type: "channel_manually_edited", message: "edited" },
      { event_type: "package_review_decided", message: "Changes requested" },
      { event_type: "package_withdrawn", message: "withdrawn" },
      { event_type: "system_error", message: "failed" },
    ];
    expect(filterDisplayedActivity(events)).toHaveLength(events.length);
  });
});
