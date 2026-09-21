import { afterEach, describe, expect, it } from "vitest";
import { resolveAuthSiteUrl } from "@/lib/auth/site-url";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const originalVercelUrl = process.env.VERCEL_URL;
const originalPublicVercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = originalProductionUrl;
  process.env.VERCEL_URL = originalVercelUrl;
  process.env.NEXT_PUBLIC_VERCEL_URL = originalPublicVercelUrl;
});

function clearSiteEnv() {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;
  delete process.env.NEXT_PUBLIC_VERCEL_URL;
}

describe("resolveAuthSiteUrl", () => {
  it("prefers the explicitly configured canonical site URL", () => {
    clearSiteEnv();
    process.env.NEXT_PUBLIC_SITE_URL = "https://content.example.com/";

    expect(resolveAuthSiteUrl()).toBe("https://content.example.com");
  });

  it("uses Vercel's production URL instead of localhost in production deployments", () => {
    clearSiteEnv();
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "content-app-nine-fawn.vercel.app";

    expect(resolveAuthSiteUrl()).toBe("https://content-app-nine-fawn.vercel.app");
  });

  it("falls back to the current request origin when no canonical deployment URL is configured", () => {
    clearSiteEnv();
    const requestHeaders = new Headers({
      host: "content-app-nine-fawn.vercel.app",
      "x-forwarded-proto": "https",
    });

    expect(resolveAuthSiteUrl(requestHeaders)).toBe("https://content-app-nine-fawn.vercel.app");
  });

  it("keeps local development on http localhost", () => {
    clearSiteEnv();
    const requestHeaders = new Headers({ host: "localhost:3000" });

    expect(resolveAuthSiteUrl(requestHeaders)).toBe("http://localhost:3000");
  });
});
