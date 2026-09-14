import { describe, expect, it } from "vitest";
import { validateUsefulContent } from "@/lib/research/useful-content";

describe("validateUsefulContent", () => {
  it("marks a substantive article body as usable", () => {
    const markdown = `# AI Agents in Recruiting\n\n${"Some teams reported reduced administrative workload after adopting AI screening tools. ".repeat(10)}`;
    const result = validateUsefulContent(markdown);
    expect(result.usable).toBe(true);
  });

  it("marks very short content as unusable", () => {
    const result = validateUsefulContent("Loading...");
    expect(result.usable).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("marks a cookie-notice-only page as unusable", () => {
    const markdown = "We use cookies to improve your experience. Please accept cookies to continue. Accept all cookies.";
    const result = validateUsefulContent(markdown);
    expect(result.usable).toBe(false);
  });

  it("marks a login-wall page as unusable", () => {
    const markdown = "Please log in to view this content. Sign in to continue reading this article.";
    const result = validateUsefulContent(markdown);
    expect(result.usable).toBe(false);
  });

  it("marks a 404-style error page as unusable", () => {
    const markdown = "404 Not Found\n\nThe page you requested could not be found.";
    const result = validateUsefulContent(markdown);
    expect(result.usable).toBe(false);
  });

  it("marks content with too few sentences as unusable even if long", () => {
    const markdown = "word ".repeat(200);
    const result = validateUsefulContent(markdown);
    expect(result.usable).toBe(false);
  });
});
