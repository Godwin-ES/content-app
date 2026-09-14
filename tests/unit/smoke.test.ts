import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/lib/domain/status";

describe("application foundation", () => {
  it("exposes the Week 4 product name", () => {
    expect(APP_NAME).toBe("Koya Content Studio");
  });
});
