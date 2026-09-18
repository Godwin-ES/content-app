import { describe, it, expect } from "vitest";
import { checkIntakeFields, blockingIntakeFlags } from "@/lib/domain/intake-checks";

const flagsFor = (values: Parameters<typeof checkIntakeFields>[0]) => checkIntakeFields(values).map((f) => f.field);

describe("checkIntakeFields", () => {
  it("passes a sensible intake with nothing to say", () => {
    expect(
      checkIntakeFields({
        audience: "HR leaders at mid-size firms",
        objective: "Educate and build authority",
        tone: "Professional, practical",
        primaryKeyword: "ai recruiting agents",
        cta: "Book a walkthrough",
      })
    ).toEqual([]);
  });

  it("never flags a blank optional field — leaving it out is a supported choice", () => {
    expect(checkIntakeFields({ audience: "", objective: null, tone: undefined, primaryKeyword: "", cta: "" })).toEqual([]);
  });

  it("flags mashed keys and keyboard walks", () => {
    expect(flagsFor({ audience: "asdfgh" })).toEqual(["audience"]);
    expect(flagsFor({ audience: "qwertyui" })).toEqual(["audience"]);
    expect(flagsFor({ objective: "aaaaaaaa" })).toEqual(["objective"]);
    expect(flagsFor({ tone: "hgfdsa" })).toEqual(["tone"]);
  });

  it("leaves junk that reads like language to the AI reviewer", () => {
    // Deterministic rules cannot tell that "purple monday hiring" is not
    // an audience without a dictionary, and a dictionary would reject the
    // coinages and product names these fields are full of.
    expect(checkIntakeFields({ audience: "purple monday hiring" })).toEqual([]);
  });

  it("flags an answer too short to have said anything", () => {
    expect(flagsFor({ tone: "a" })).toEqual(["tone"]);
  });

  it("does not mistake a real short phrase for mashed keys", () => {
    expect(checkIntakeFields({ audience: "CTOs", tone: "Warm", cta: "Book a demo" })).toEqual([]);
  });

  it("blocks a keyword that is really a list", () => {
    const flags = blockingIntakeFlags({ primaryKeyword: "ai recruiting, hiring automation" });
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain("one phrase");

    expect(blockingIntakeFlags({ primaryKeyword: "ai recruiting and hiring automation" })).toHaveLength(1);
  });

  it("blocks a keyword that is a sentence", () => {
    const flags = blockingIntakeFlags({ primaryKeyword: "how artificial intelligence agents are changing modern recruiting workflows today" });
    expect(flags[0].message).toContain("sentence");
  });

  it("blocks a keyword with no meaningful word in it", () => {
    const flags = blockingIntakeFlags({ primaryKeyword: "the and of" });
    expect(flags.length).toBeGreaterThanOrEqual(1);
    expect(flags.some((f) => f.message.includes("meaningful word"))).toBe(true);
  });

  it("keeps free-text flags advisory, so a deliberate brand term can still be used", () => {
    // "Talent Ceiling" is the kind of coinage a heuristic cannot judge.
    const flags = checkIntakeFields({ audience: "qqqqqq" });
    expect(flags).toHaveLength(1);
    expect(flags[0].blocking).toBe(false);
    expect(blockingIntakeFlags({ audience: "qqqqqq" })).toEqual([]);
  });
});
