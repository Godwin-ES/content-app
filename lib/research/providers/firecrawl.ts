import "server-only";
import Firecrawl, { type Document, type SearchResultWeb } from "firecrawl";
import { DomainError } from "@/lib/domain/errors";
import { canonicalizeUrl } from "@/lib/research/url";
import { validateUsefulContent } from "@/lib/research/useful-content";
import type { ResearchProvider, RetrievalOutcome, RetrievedPage, SearchResultItem } from "@/lib/research/types";

function isRetrySafe(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("timeout") || message.includes("timed out") || message.includes("econnreset");
}

function normalizeSearchItem(item: SearchResultWeb | Document): SearchResultItem {
  if ("url" in item && typeof item.url === "string" && !("metadata" in item)) {
    const webItem = item as SearchResultWeb;
    return {
      url: webItem.url,
      title: webItem.title ?? null,
      snippet: webItem.description ?? null,
    };
  }
  const doc = item as Document;
  return {
    url: doc.metadata?.sourceURL ?? doc.metadata?.url ?? "",
    title: doc.metadata?.title ?? null,
    snippet: doc.metadata?.description ?? null,
  };
}

/**
 * Firecrawl adapter (SYSTEM-DESIGN-NEXTJS.md §9.3, §5.2). Converts
 * Firecrawl's response shapes into application types; no Firecrawl-specific
 * type ever crosses this boundary. `search()` returns candidate URLs only —
 * a snippet is never treated as evidence. `retrieve()` classifies the
 * result into usable/unusable/failed rather than only checking HTTP status.
 */
export class FirecrawlResearchProvider implements ResearchProvider {
  private client: Firecrawl;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.FIRECRAWL_API_KEY;
    if (!key) {
      throw new DomainError("CONFIGURATION_ERROR", "research_provider", "Missing FIRECRAWL_API_KEY.");
    }
    this.client = new Firecrawl({ apiKey: key });
  }

  async search(query: string, limit: number): Promise<SearchResultItem[]> {
    try {
      const result = await this.client.search(query, { limit });
      return (result.web ?? []).map(normalizeSearchItem).filter((item) => item.url.length > 0);
    } catch (error) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "research_search",
        error instanceof Error ? error.message : "Search failed.",
        isRetrySafe(error)
      );
    }
  }

  async retrieve(url: string): Promise<RetrievalOutcome> {
    let document: Document;
    try {
      document = await this.client.scrape(url, { formats: ["markdown"] });
    } catch (error) {
      return {
        status: "failed",
        reason: error instanceof Error ? error.message : "Retrieval failed.",
        retrySafe: isRetrySafe(error),
      };
    }

    const statusCode = document.metadata?.statusCode;
    if (typeof statusCode === "number" && (statusCode < 200 || statusCode >= 300)) {
      return { status: "failed", reason: `Page returned HTTP ${statusCode}.`, retrySafe: false };
    }

    const markdown = document.markdown ?? "";
    const canonicalSource =
      (document.metadata?.ogUrl as string | undefined) ?? (document.metadata?.url as string | undefined) ?? url;

    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeUrl(canonicalSource);
    } catch {
      canonicalUrl = canonicalizeUrl(url);
    }

    const page: RetrievedPage = {
      originalUrl: url,
      canonicalUrl,
      title: document.metadata?.title ?? null,
      publisher: (document.metadata?.ogSiteName as string | undefined) ?? null,
      author: (document.metadata?.author as string | undefined) ?? null,
      publishedAt: (document.metadata?.publishedTime as string | undefined) ?? null,
      markdown,
      retrievedAt: new Date().toISOString(),
    };

    const usefulCheck = validateUsefulContent(markdown);
    if (!usefulCheck.usable) {
      return { status: "unusable", page, reason: usefulCheck.reason ?? "Page content is not usable." };
    }

    return { status: "usable", page };
  }
}
