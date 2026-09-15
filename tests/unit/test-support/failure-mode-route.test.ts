import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

function request(method: string, options: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers["x-koya-test-token"] = options.token;
  return new NextRequest("http://localhost/api/test/failure-mode", {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe("failure-mode route gate", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    cookieStore.clear();
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    process.env.ENABLE_FAILURE_INJECTION = "true";
    process.env.TEST_FAILURE_TOKEN = "correct-token";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it("returns 404 with no token at all", async () => {
    const { POST } = await import("@/app/api/test/failure-mode/route");
    const response = await POST(request("POST", { body: { mode: "ai_generation_timeout" } }));
    expect(response.status).toBe(404);
  });

  it("returns 404 with an incorrect token", async () => {
    const { POST } = await import("@/app/api/test/failure-mode/route");
    const response = await POST(request("POST", { token: "wrong", body: { mode: "ai_generation_timeout" } }));
    expect(response.status).toBe(404);
  });

  it("returns 404 when the feature flag is off, even with the correct token", async () => {
    process.env.ENABLE_FAILURE_INJECTION = "false";
    const { POST } = await import("@/app/api/test/failure-mode/route");
    const response = await POST(request("POST", { token: "correct-token", body: { mode: "ai_generation_timeout" } }));
    expect(response.status).toBe(404);
  });

  it("returns 404 in production, even with the correct token and flag on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("@/app/api/test/failure-mode/route");
    const response = await POST(request("POST", { token: "correct-token", body: { mode: "ai_generation_timeout" } }));
    expect(response.status).toBe(404);
  });

  it("rejects an unrecognized failure mode even when authorized", async () => {
    const { POST } = await import("@/app/api/test/failure-mode/route");
    const response = await POST(request("POST", { token: "correct-token", body: { mode: "rm -rf /" } }));
    expect(response.status).toBe(400);
  });

  it("sets the cookie for a valid mode when fully authorized", async () => {
    const { POST } = await import("@/app/api/test/failure-mode/route");
    const response = await POST(request("POST", { token: "correct-token", body: { mode: "ai_generation_timeout" } }));
    expect(response.status).toBe(200);
    expect(cookieStore.get("koya_test_failure")).toBe("ai_generation_timeout");
  });

  it("clears the cookie on an authorized DELETE", async () => {
    cookieStore.set("koya_test_failure", "ai_generation_timeout");
    const { DELETE } = await import("@/app/api/test/failure-mode/route");
    const response = await DELETE(request("DELETE", { token: "correct-token" }));
    expect(response.status).toBe(200);
    expect(cookieStore.has("koya_test_failure")).toBe(false);
  });

  it("returns 404 for DELETE without the correct token", async () => {
    cookieStore.set("koya_test_failure", "ai_generation_timeout");
    const { DELETE } = await import("@/app/api/test/failure-mode/route");
    const response = await DELETE(request("DELETE", {}));
    expect(response.status).toBe(404);
    expect(cookieStore.has("koya_test_failure")).toBe(true);
  });
});
