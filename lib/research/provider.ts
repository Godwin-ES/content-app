import "server-only";
import { DomainError } from "@/lib/domain/errors";
import type { ResearchProvider } from "@/lib/research/types";
import { FirecrawlResearchProvider } from "@/lib/research/providers/firecrawl";
import { FakeResearchProvider } from "@/lib/research/providers/fake";

let fakeProviderSingleton: FakeResearchProvider | null = null;

/**
 * Mirrors lib/ai/provider.ts's production safety boundary: fake providers
 * can never activate in production, regardless of misconfiguration.
 */
export function getResearchProvider(): ResearchProvider {
  if (process.env.USE_FAKE_PROVIDERS === "true") {
    if (process.env.NODE_ENV === "production") {
      throw new DomainError("CONFIGURATION_ERROR", "research_provider", "Fake research providers cannot be used in production.");
    }
    if (!fakeProviderSingleton) {
      fakeProviderSingleton = new FakeResearchProvider();
    }
    return fakeProviderSingleton;
  }
  return new FirecrawlResearchProvider();
}
