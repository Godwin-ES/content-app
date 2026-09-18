import { describe, expect, it } from "vitest";
import { contentRequestInputSchema } from "@/lib/domain/schemas";
import { DEFAULT_REQUEST_SETTINGS, resolveRequestSettings } from "@/lib/domain/defaults";

describe("resolveRequestSettings", () => {
  it("resolves visible defaults for a topic-only request", () => {
    const input = contentRequestInputSchema.parse({ topic: "AI agents in recruiting" });
    const resolved = resolveRequestSettings(input);

    expect(resolved.audience.value).toBe(DEFAULT_REQUEST_SETTINGS.audience);
    expect(resolved.audience.source).toBe("default");
    expect(resolved.objective.value).toBe(DEFAULT_REQUEST_SETTINGS.objective);
    expect(resolved.objective.source).toBe("default");
    expect(resolved.tone.value).toBe(DEFAULT_REQUEST_SETTINGS.tone);
    expect(resolved.tone.source).toBe("default");
  });

  it("preserves supplied values and marks them as supplied", () => {
    const input = contentRequestInputSchema.parse({
      topic: "AI agents in recruiting",
      audience: "HR leaders",
      objective: "Drive demo signups",
      tone: "Bold and direct",
    });
    const resolved = resolveRequestSettings(input);

    expect(resolved.audience).toEqual({ value: "HR leaders", source: "supplied" });
    expect(resolved.objective).toEqual({ value: "Drive demo signups", source: "supplied" });
    expect(resolved.tone).toEqual({ value: "Bold and direct", source: "supplied" });
  });

  it("resolves a mix of supplied and default values independently", () => {
    const input = contentRequestInputSchema.parse({
      topic: "AI agents in recruiting",
      audience: "HR leaders",
    });
    const resolved = resolveRequestSettings(input);

    expect(resolved.audience.source).toBe("supplied");
    expect(resolved.objective.source).toBe("default");
  });
});
