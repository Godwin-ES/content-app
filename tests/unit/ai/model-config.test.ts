import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

// vi.resetModules() means a dynamically re-imported DomainError class is not
// the same reference as one imported statically, so assertions below check
// the stable `name`/`code` shape instead of `instanceof`.
function expectDomainError(fn: () => void) {
  expect(fn).toThrowError();
  try {
    fn();
  } catch (error) {
    expect((error as { name: string }).name).toBe("DomainError");
    expect((error as { code: string }).code).toBe("VALIDATION_ERROR");
  }
}

async function freshModelConfig() {
  vi.resetModules();
  return await import("@/lib/ai/model-config");
}

describe("getAllowedAIModels", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns all three models when the deployment allows choosing one", async () => {
    process.env.ALLOW_MODEL_SELECTION = "true";
    process.env.PRODUCTION_AI_MODEL = "claude_sonnet_5";
    const { getAllowedAIModels } = await freshModelConfig();
    expect(getAllowedAIModels().sort()).toEqual(
      ["claude_haiku_4_5", "claude_sonnet_5", "gemini"].sort()
    );
  });

  it("returns only the configured production model when choosing is not allowed", async () => {
    process.env.ALLOW_MODEL_SELECTION = "false";
    process.env.PRODUCTION_AI_MODEL = "claude_haiku_4_5";
    const { getAllowedAIModels } = await freshModelConfig();
    expect(getAllowedAIModels()).toEqual(["claude_haiku_4_5"]);
  });

  it("treats a missing ALLOW_MODEL_SELECTION as disabled", async () => {
    delete process.env.ALLOW_MODEL_SELECTION;
    process.env.PRODUCTION_AI_MODEL = "claude_sonnet_5";
    const { getAllowedAIModels } = await freshModelConfig();
    expect(getAllowedAIModels()).toEqual(["claude_sonnet_5"]);
  });
});

describe("assertAllowedAIModel", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts a model within the allowed set", async () => {
    process.env.ALLOW_MODEL_SELECTION = "true";
    process.env.PRODUCTION_AI_MODEL = "claude_sonnet_5";
    const { assertAllowedAIModel } = await freshModelConfig();
    expect(() => assertAllowedAIModel("gemini")).not.toThrow();
  });

  it("rejects an arbitrary client-supplied model string as a DomainError", async () => {
    process.env.ALLOW_MODEL_SELECTION = "true";
    process.env.PRODUCTION_AI_MODEL = "claude_sonnet_5";
    const { assertAllowedAIModel } = await freshModelConfig();
    expectDomainError(() => assertAllowedAIModel("gpt-4o"));
  });

  it("rejects a selectable model when choosing is not allowed", async () => {
    process.env.ALLOW_MODEL_SELECTION = "false";
    process.env.PRODUCTION_AI_MODEL = "claude_haiku_4_5";
    const { assertAllowedAIModel } = await freshModelConfig();
    expectDomainError(() => assertAllowedAIModel("gemini"));
  });
});

describe("resolveModelId", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("maps a model choice to its configured provider model id", async () => {
    process.env.ALLOW_MODEL_SELECTION = "true";
    process.env.ANTHROPIC_SONNET_MODEL = "claude-sonnet-4-5-test";
    process.env.PRODUCTION_AI_MODEL = "claude_sonnet_5";
    const { resolveModelId } = await freshModelConfig();
    expect(resolveModelId("claude_sonnet_5")).toBe("claude-sonnet-4-5-test");
  });
});
