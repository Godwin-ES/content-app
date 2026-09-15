import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeAIProvider } from "@/lib/ai/providers/fake";
import { FakeResearchProvider } from "@/lib/research/providers/fake";
import {
  FailureInjectingAIProvider,
  FailureInjectingResearchProvider,
  applyAIFailureInjection,
  applyResearchFailureInjection,
} from "@/lib/test-support/injected-providers";

const schema = z.object({ ok: z.boolean() });

describe("FailureInjectingAIProvider", () => {
  it("throws immediately for ai_generation_timeout without consuming the inner provider's queue", async () => {
    const inner = new FakeAIProvider([{ ok: true }]);
    const provider = new FailureInjectingAIProvider(inner, "ai_generation_timeout");

    await expect(provider.generateStructured({ modelId: "m", system: "s", user: "u", schema })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    // The inner queue was never touched.
    const result = await inner.generateStructured({ modelId: "m", system: "s", user: "u", schema });
    expect(result).toEqual({ ok: true });
  });

  it("throws for ai_evaluation_failure the same way", async () => {
    const inner = new FakeAIProvider([{ ok: true }]);
    const provider = new FailureInjectingAIProvider(inner, "ai_evaluation_failure");
    await expect(provider.generateStructured({ modelId: "m", system: "s", user: "u", schema })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("throws a schema-validation-shaped error for malformed_ai_output", async () => {
    const inner = new FakeAIProvider([{ ok: true }]);
    const provider = new FailureInjectingAIProvider(inner, "malformed_ai_output");
    await expect(provider.generateStructured({ modelId: "m", system: "s", user: "u", schema })).rejects.toThrow(/malformed/i);
  });

  it("delays then still returns the inner provider's real result for delayed_ai_response", async () => {
    const inner = new FakeAIProvider([{ ok: true }]);
    const provider = new FailureInjectingAIProvider(inner, "delayed_ai_response");
    const start = Date.now();
    const result = await provider.generateStructured({ modelId: "m", system: "s", user: "u", schema });
    expect(Date.now() - start).toBeGreaterThanOrEqual(5900);
    expect(result).toEqual({ ok: true });
  }, 10000);

  it("passes through untouched when no mode applies", () => {
    const inner = new FakeAIProvider([{ ok: true }]);
    expect(applyAIFailureInjection(inner, null)).toBe(inner);
    expect(applyAIFailureInjection(inner, "research_timeout")).toBe(inner);
  });

  it("wraps when an AI-relevant mode applies", () => {
    const inner = new FakeAIProvider([{ ok: true }]);
    expect(applyAIFailureInjection(inner, "ai_generation_timeout")).toBeInstanceOf(FailureInjectingAIProvider);
  });
});

describe("FailureInjectingResearchProvider", () => {
  it("throws for research_timeout on search()", async () => {
    const inner = new FakeResearchProvider();
    const provider = new FailureInjectingResearchProvider(inner, "research_timeout");
    await expect(provider.search("query", 5)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns a failed retrieval outcome for source_retrieval_failure instead of throwing", async () => {
    const inner = new FakeResearchProvider();
    const provider = new FailureInjectingResearchProvider(inner, "source_retrieval_failure");
    const outcome = await provider.retrieve("https://example.com/a");
    expect(outcome.status).toBe("failed");
  });

  it("passes through untouched when no research mode applies", () => {
    const inner = new FakeResearchProvider();
    expect(applyResearchFailureInjection(inner, null)).toBe(inner);
    expect(applyResearchFailureInjection(inner, "ai_generation_timeout")).toBe(inner);
  });

  it("wraps when a research-relevant mode applies", () => {
    const inner = new FakeResearchProvider();
    expect(applyResearchFailureInjection(inner, "source_retrieval_failure")).toBeInstanceOf(FailureInjectingResearchProvider);
  });
});
