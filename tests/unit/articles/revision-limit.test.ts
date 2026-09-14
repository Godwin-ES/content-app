import { describe, expect, it } from "vitest";
import { canAutoRevise } from "@/lib/articles/service";

describe("canAutoRevise", () => {
  it("allows an automatic revision when none have been used and evaluation says revise", () => {
    expect(canAutoRevise(0, "revise")).toBe(true);
  });

  it("refuses a second automatic revision even if evaluation still says revise", () => {
    expect(canAutoRevise(1, "revise")).toBe(false);
  });

  it("refuses an automatic revision when evaluation passed", () => {
    expect(canAutoRevise(0, "pass")).toBe(false);
  });

  it("refuses an automatic revision when evaluation was rejected", () => {
    expect(canAutoRevise(0, "reject")).toBe(false);
  });

  it("refuses an automatic revision when there is no evaluation yet", () => {
    expect(canAutoRevise(0, null)).toBe(false);
  });
});
