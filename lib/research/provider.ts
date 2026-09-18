import "server-only";
import type { ResearchProvider } from "@/lib/research/types";
import { FirecrawlResearchProvider } from "@/lib/research/providers/firecrawl";
/**
 * The retrieval provider. There is one, and it is real.
 *
 * The in-memory fakes remain as classes the test suite constructs
 * directly; they are no longer reachable from a running app, which is one
 * fewer way for a misconfigured deploy to serve fabricated content.
 */
export async function getResearchProvider(): Promise<ResearchProvider> {
  return new FirecrawlResearchProvider();
}
