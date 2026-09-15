import { describe, expect, it } from "vitest";
import { validateSchedule } from "@/lib/publishing/validate";

describe("validateSchedule", () => {
  it("allows a null schedule (immediate queue)", () => {
    expect(validateSchedule({ scheduledAt: null, timezone: null })).toEqual({ ok: true, message: null });
  });

  it("allows a future time with a timezone", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = validateSchedule({ scheduledAt: future, timezone: "America/New_York" });
    expect(result.ok).toBe(true);
  });

  it("rejects a past scheduled time", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = validateSchedule({ scheduledAt: past, timezone: "America/New_York" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/future/i);
  });

  it("requires a timezone when a schedule time is given", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = validateSchedule({ scheduledAt: future, timezone: null });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/timezone/i);
  });

  it("rejects an unparsable date string", () => {
    const result = validateSchedule({ scheduledAt: "not-a-date", timezone: "UTC" });
    expect(result.ok).toBe(false);
  });

  it("rejects a blank timezone string", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = validateSchedule({ scheduledAt: future, timezone: "   " });
    expect(result.ok).toBe(false);
  });
});
