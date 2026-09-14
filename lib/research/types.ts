export interface SearchResultItem {
  url: string;
  title: string | null;
  snippet: string | null;
}

export interface RetrievedPage {
  originalUrl: string;
  canonicalUrl: string;
  title: string | null;
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  markdown: string;
  retrievedAt: string;
}

export type RetrievalOutcome =
  | { status: "usable"; page: RetrievedPage }
  | { status: "unusable"; page: RetrievedPage; reason: string }
  | { status: "failed"; reason: string; retrySafe: boolean };

/**
 * Provider-neutral research boundary (SYSTEM-DESIGN-NEXTJS.md §5.2). The
 * domain layer never depends on Firecrawl-specific response shapes; the
 * adapter converts them into these application types.
 */
export interface ResearchProvider {
  search(query: string, limit: number): Promise<SearchResultItem[]>;
  retrieve(url: string): Promise<RetrievalOutcome>;
}
