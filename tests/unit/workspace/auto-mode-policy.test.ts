import { describe, expect, it } from "vitest";
import { autoModeCanPerform, AUTO_MODE_FINAL_STAGE } from "@/lib/workspace/auto-mode";
import { AUTO_MODE_STAGES, PIPELINE_STAGES, type NextActionKey } from "@/lib/workspace/next-action";

/**
 * The brief requires "a review step where a human can approve... before
 * publishing or scheduling". Auto mode exists to remove the waiting, not the
 * review — so the gate is asserted here rather than left to the reading of
 * one set literal. It matters more, not less, now that the person who
 * approves is the person who asked for the content: the only thing standing
 * between a topic and a publishable package is that they read it.
 */
const EVERY_ACTION: Record<NextActionKey, boolean> = {
  // Auto mode performs these.
  add_sources: true,
  review_sources: true,
  generate_content_plan: true,
  generate_articles: true,
  resolve_article_generation_failure: true,
  resolve_article_evaluation: true,
  select_article: true,
  generate_channels: true,
  resolve_channel_issue: true,
  create_package: true,
  // It must not perform these.
  wait_for_research: false,
  resolve_no_usable_sources: false,
  decide_package: false,
  await_decision: false,
  address_requested_changes: false,
  queue_approved_content: false,
  none: false,
};

describe("auto mode policy", () => {
  it("classifies every next action, so a new one cannot default into automation", () => {
    for (const [key, allowed] of Object.entries(EVERY_ACTION) as Array<[NextActionKey, boolean]>) {
      expect({ key, allowed: autoModeCanPerform(key) }).toEqual({ key, allowed });
    }
  });

  it("never approves, asks for changes, or publishes", () => {
    for (const key of ["decide_package", "await_decision", "address_requested_changes", "queue_approved_content"] as NextActionKey[]) {
      expect(autoModeCanPerform(key)).toBe(false);
    }
  });

  it("stops at the package, and offers no stage beyond it", () => {
    expect(AUTO_MODE_FINAL_STAGE).toBe("Package");
    expect(AUTO_MODE_STAGES).not.toContain("Publishing");
    // Every offered stop is a real pipeline stage.
    for (const stage of AUTO_MODE_STAGES) expect(PIPELINE_STAGES).toContain(stage);
  });
});
