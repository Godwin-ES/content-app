import { describe, it, expect } from "vitest";
import { checkIntakeFields, blockingIntakeFlags } from "@/lib/domain/intake-checks";

const flagsFor = (values: Parameters<typeof checkIntakeFields>[0]) => checkIntakeFields(values).map((f) => f.field);

describe("checkIntakeFields", () => {
  it("passes a sensible intake with nothing to say", () => {
    expect(
      checkIntakeFields({
        topic: "How AI agents are changing recruiting workflows",
        audience: "HR leaders at mid-size firms",
        objective: "Educate and build authority",
        tone: "Professional, practical",
      })
    ).toEqual([]);
  });

  it("never flags a blank optional field — leaving it out is a supported choice", () => {
    expect(checkIntakeFields({ audience: "", objective: null, tone: undefined })).toEqual([]);
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
    expect(checkIntakeFields({ audience: "CTOs", tone: "Warm" })).toEqual([]);
  });




  it("keeps free-text flags advisory, so a deliberate brand term can still be used", () => {
    // "Talent Ceiling" is the kind of coinage a heuristic cannot judge.
    const flags = checkIntakeFields({ audience: "qqqqqq" });
    expect(flags).toHaveLength(1);
    expect(flags[0].blocking).toBe(false);
    expect(blockingIntakeFlags({ audience: "qqqqqq" })).toEqual([]);
  });
});

describe("the topic, which is required and spends the whole pipeline", () => {
  it("blocks a topic that is not language", () => {
    // Unlike the optional fields these are blocking, because a keyboard
    // walk is a slip rather than a coinage, and the topic is what the
    // research, three article options and four channel assets are built
    // from.
    for (const topic of ["asdfghjk", "aaaaaaaa", "qwertyui"]) {
      const flags = blockingIntakeFlags({ topic });
      expect(flags, topic).toHaveLength(1);
      expect(flags[0].field).toBe("topic");
    }
  });

  it("blocks a topic too short to research", () => {
    const flags = blockingIntakeFlags({ topic: "AI" });
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain("too short");
  });

  it("accepts a short but real topic", () => {
    expect(checkIntakeFields({ topic: "AI agents" })).toEqual([]);
    expect(checkIntakeFields({ topic: "Recruiting automation" })).toEqual([]);
  });

  it("leaves a vague-but-real topic to the AI reviewer", () => {
    // "business" is a real word, so no mechanical rule can tell it is too
    // vague to research. That judgement can be wrong, so it stays with the
    // reviewer and stays dismissible.
    expect(checkIntakeFields({ topic: "business" })).toEqual([]);
  });

  it("does not flag an empty topic — zod already requires it", () => {
    expect(checkIntakeFields({ topic: "" })).toEqual([]);
  });
});
