import type { ResearchProvider, RetrievalOutcome, SearchResultItem } from "@/lib/research/types";

/**
 * Deterministic test double, mirroring lib/ai/providers/fake.ts. Tests
 * register fixed search results and retrieval outcomes per URL/query
 * instead of making real network calls (SYSTEM-DESIGN-NEXTJS.md §36.4).
 */
export class FakeResearchProvider implements ResearchProvider {
  constructor(
    private searchResults: Record<string, SearchResultItem[]> = {},
    private retrievals: Record<string, RetrievalOutcome> = {}
  ) {}

  setSearchResults(query: string, results: SearchResultItem[]): void {
    this.searchResults[query] = results;
  }

  setRetrieval(url: string, outcome: RetrievalOutcome): void {
    this.retrievals[url] = outcome;
  }

  async search(query: string, limit: number): Promise<SearchResultItem[]> {
    return (this.searchResults[query] ?? []).slice(0, limit);
  }

  async retrieve(url: string): Promise<RetrievalOutcome> {
    return this.retrievals[url] ?? { status: "failed", reason: "No fixture registered for this URL.", retrySafe: false };
  }
}
