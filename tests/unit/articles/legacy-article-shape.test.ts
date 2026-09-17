import { describe, expect, it } from "vitest";
import { articleBodyMarkdown, articleSections } from "@/lib/ai/schemas/article";

/**
 * `artifact_versions` and an approved package's `snapshot` are immutable by
 * design, so every article written before the move to `sections` is still
 * stored as one `bodyMarkdown` string and always will be. Readers have to
 * handle both shapes; rendering a pre-sections article used to throw
 * "Cannot read properties of undefined (reading 'map')" and took the whole
 * printable sample pack down with it.
 */
const LEGACY = {
  title: "How AI Agents Are Transforming Recruiting",
  bodyMarkdown: [
    "# How AI Agents Are Transforming Recruiting",
    "",
    "Talent acquisition is changing.",
    "",
    "## Defining AI Agents",
    "",
    "They act with autonomy.",
    "",
    "### Beyond Generative AI",
    "",
    "Generative models need prompting.",
  ].join("\n"),
};

const MODERN = {
  title: "Modern",
  sections: [{ heading: "Overview", level: "h2" as const, bodyMarkdown: "Body text." }],
};

describe("articleBodyMarkdown", () => {
  it("returns a pre-sections article's markdown untouched", () => {
    // It already opens with its own H1, so prepending another would give
    // the SEO scan two and break the "exactly one H1" check.
    expect(articleBodyMarkdown(LEGACY)).toBe(LEGACY.bodyMarkdown);
  });

  it("still builds markdown from sections for a current article", () => {
    expect(articleBodyMarkdown(MODERN)).toBe("# Modern\n\n## Overview\n\nBody text.");
  });
});

describe("articleSections", () => {
  it("recovers editable sections from a pre-sections article", () => {
    const sections = articleSections(LEGACY);
    expect(sections.map((s) => [s.heading, s.level])).toEqual([
      ["How AI Agents Are Transforming Recruiting", "h2"],
      ["Defining AI Agents", "h2"],
      ["Beyond Generative AI", "h3"],
    ]);
    // The preamble is kept rather than dropped, minus the duplicated H1.
    expect(sections[0].bodyMarkdown).toBe("Talent acquisition is changing.");
    expect(sections[2].bodyMarkdown).toBe("Generative models need prompting.");
  });

  it("returns the stored sections unchanged for a current article", () => {
    expect(articleSections(MODERN)).toBe(MODERN.sections);
  });

  it("falls back to a single section when there are no headings at all", () => {
    const sections = articleSections({ title: "Flat", bodyMarkdown: "Just one paragraph." });
    expect(sections).toEqual([{ heading: "Flat", level: "h2", bodyMarkdown: "Just one paragraph." }]);
  });
});
