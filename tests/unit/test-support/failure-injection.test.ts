import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
  }),
}));

describe("failure injection gating", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    cookieStore.clear();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it("is disabled outside development/test unless every condition holds", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ENABLE_FAILURE_INJECTION = "true";
    const { isFailureInjectionEnabled } = await import("@/lib/test-support/failure-injection");
    expect(isFailureInjectionEnabled()).toBe(false);
  });

  it("is disabled when the feature flag is off, even outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.ENABLE_FAILURE_INJECTION = "false";
    const { isFailureInjectionEnabled } = await import("@/lib/test-support/failure-injection");
    expect(isFailureInjectionEnabled()).toBe(false);
  });

  it("is enabled only when not production and the flag is explicitly true", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.ENABLE_FAILURE_INJECTION = "true";
    const { isFailureInjectionEnabled } = await import("@/lib/test-support/failure-injection");
    expect(isFailureInjectionEnabled()).toBe(true);
  });

  it("rejects any value that is not one of the enumerated failure modes", async () => {
    const { isValidFailureMode } = await import("@/lib/test-support/failure-injection");
    expect(isValidFailureMode("ai_generation_timeout")).toBe(true);
    expect(isValidFailureMode("rm -rf /")).toBe(false);
    expect(isValidFailureMode("")).toBe(false);
  });

  it("never returns an injected mode when the feature is disabled, even if the cookie is set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.ENABLE_FAILURE_INJECTION = "false";
    const { getInjectedFailureMode, FAILURE_MODE_COOKIE } = await import("@/lib/test-support/failure-injection");
    cookieStore.set(FAILURE_MODE_COOKIE, "ai_generation_timeout");
    expect(await getInjectedFailureMode()).toBeNull();
  });

  it("returns the cookie's mode when the feature is enabled and the cookie is valid", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.ENABLE_FAILURE_INJECTION = "true";
    const { getInjectedFailureMode, FAILURE_MODE_COOKIE } = await import("@/lib/test-support/failure-injection");
    cookieStore.set(FAILURE_MODE_COOKIE, "notification_failure");
    expect(await getInjectedFailureMode()).toBe("notification_failure");
  });

  it("ignores a garbage cookie value rather than throwing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.ENABLE_FAILURE_INJECTION = "true";
    const { getInjectedFailureMode, FAILURE_MODE_COOKIE } = await import("@/lib/test-support/failure-injection");
    cookieStore.set(FAILURE_MODE_COOKIE, "not-a-real-mode");
    expect(await getInjectedFailureMode()).toBeNull();
  });
});
