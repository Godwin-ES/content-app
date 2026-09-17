import { describe, expect, it } from "vitest";
import { validateLinkedinPost, validateXPost, validateNewsletter } from "@/lib/channels/validate";

function findCheck<T extends { key: string }>(checks: T[], key: string) {
  return checks.find((c) => c.key === key);
}

function words(count: number): string {
  return Array.from({ length: count }, (_, i) => `word${i}`).join(" ");
}

describe("validateLinkedinPost", () => {
  it("passes a well-formed post", () => {
    const checks = validateLinkedinPost({ body: "A short PAS-style post.", hasCallToAction: true });
    expect(findCheck(checks, "post_present")?.ok).toBe(true);
    expect(findCheck(checks, "has_call_to_action")?.ok).toBe(true);
  });

  it("fails post_present for an empty body", () => {
    const checks = validateLinkedinPost({ body: "   ", hasCallToAction: true });
    expect(findCheck(checks, "post_present")?.ok).toBe(false);
  });

  it("fails has_call_to_action when absent", () => {
    const checks = validateLinkedinPost({ body: "Some post.", hasCallToAction: false });
    expect(findCheck(checks, "has_call_to_action")?.ok).toBe(false);
  });
});

describe("validateXPost", () => {
  it("passes a well-formed post with two hashtags", () => {
    const checks = validateXPost({ body: "A focused post.", hashtags: ["#ai", "#hr"] });
    expect(findCheck(checks, "post_present")?.ok).toBe(true);
    expect(findCheck(checks, "hashtag_limit")?.ok).toBe(true);
  });

  it("fails hashtag_limit with three or more hashtags", () => {
    const checks = validateXPost({ body: "A focused post.", hashtags: ["#a", "#b", "#c"] });
    expect(findCheck(checks, "hashtag_limit")?.ok).toBe(false);
  });

  it("fails post_present for an empty body", () => {
    const checks = validateXPost({ body: "", hashtags: [] });
    expect(findCheck(checks, "post_present")?.ok).toBe(false);
  });
});

describe("validateNewsletter", () => {
  function newsletter(overrides: Partial<Parameters<typeof validateNewsletter>[0]> = {}) {
    return {
      subject: "Big changes in recruiting",
      introduction: "A quick note on what's new.",
      bodyMarkdown: words(300),
      callToAction: "Read the full article.",
      signoff: "Best, The Team",
      ...overrides,
    };
  }

  it("passes a well-formed newsletter", () => {
    const checks = validateNewsletter(newsletter());
    expect(findCheck(checks, "subject_present")?.ok).toBe(true);
    expect(findCheck(checks, "intro_length")?.ok).toBe(true);
    expect(findCheck(checks, "body_present")?.ok).toBe(true);
    expect(findCheck(checks, "word_count_range")?.ok).toBe(true);
    expect(findCheck(checks, "call_to_action_present")?.ok).toBe(true);
    expect(findCheck(checks, "signoff_present")?.ok).toBe(true);
  });

  it("passes intro_length for a 3-sentence introduction", () => {
    const checks = validateNewsletter(newsletter({ introduction: "First point. Second point. Third point." }));
    expect(findCheck(checks, "intro_length")?.ok).toBe(true);
  });

  it("fails intro_length for a 4-sentence introduction", () => {
    const checks = validateNewsletter(newsletter({ introduction: "One. Two. Three. Four." }));
    expect(findCheck(checks, "intro_length")?.ok).toBe(false);
  });

  it("fails intro_length for an empty introduction", () => {
    const checks = validateNewsletter(newsletter({ introduction: "" }));
    expect(findCheck(checks, "intro_length")?.ok).toBe(false);
  });

  it("fails word_count_range when too short", () => {
    const checks = validateNewsletter(newsletter({ bodyMarkdown: words(50) }));
    expect(findCheck(checks, "word_count_range")?.ok).toBe(false);
  });

  it("fails word_count_range when too long", () => {
    const checks = validateNewsletter(newsletter({ bodyMarkdown: words(700) }));
    expect(findCheck(checks, "word_count_range")?.ok).toBe(false);
  });

  it("fails call_to_action_present when empty", () => {
    const checks = validateNewsletter(newsletter({ callToAction: "" }));
    expect(findCheck(checks, "call_to_action_present")?.ok).toBe(false);
  });

  it("fails signoff_present when empty", () => {
    const checks = validateNewsletter(newsletter({ signoff: "" }));
    expect(findCheck(checks, "signoff_present")?.ok).toBe(false);
  });
});
