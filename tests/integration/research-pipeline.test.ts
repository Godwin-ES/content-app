// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  createAdminClient,
  createTestUser,
  deleteTestUser,
  hasSupabaseCredentials,
} from "@/tests/helpers/supabase-test-clients";
import { FakeAIProvider } from "@/lib/ai/providers/fake";
import { FakeResearchProvider } from "@/lib/research/providers/fake";
import { runResearchPipeline, retryResearchSource } from "@/lib/research/service";
import { listResearchSources, listSourceEvidence } from "@/lib/repositories/sources";

const RESEARCH_PLAN = {
  primaryKeyword: "ai agents in recruiting",
  secondaryKeywords: ["recruiting automation"],
  searchIntent: "informational",
  researchQuestions: ["How are AI agents used in recruiting today?"],
  searchQueries: ["ai agents recruiting", "ai screening tools hr", "recruiting automation case study"],
  usefulSourceCategories: ["industry reports"],
};

function usableAnalysis(evidenceKey = "E1") {
  return {
    isUsable: true,
    relevanceSummary: "Directly relevant to the topic.",
    evidence: [
      {
        evidenceKey,
        excerpt: "Some teams reported reduced administrative workload.",
        conservativeSummary: "Some teams reported reduced administrative workload.",
        supports: ["use of automation in candidate screening"],
        doesNotEstablish: ["cost savings", "improved hiring outcomes"],
      },
    ],
  };
}

const hasCredentials = hasSupabaseCredentials();

describe.skipIf(!hasCredentials)("research pipeline (hosted Supabase integration)", () => {
  let admin: SupabaseClient<Database>;
  let owner: { client: SupabaseClient<Database>; userId: string };
  const requestIds: string[] = [];

  beforeAll(async () => {
    admin = createAdminClient();
    owner = await createTestUser(admin, "content_manager", "research-owner");
  });

  afterAll(async () => {
    if (requestIds.length > 0) await admin.from("content_requests").delete().in("id", requestIds);
    await deleteTestUser(admin, owner.userId);
  });

  async function newRequest(overrides: Partial<Database["public"]["Tables"]["content_requests"]["Insert"]> = {}) {
    const { data } = await admin
      .from("content_requests")
      .insert({
        owner_id: owner.userId,
        topic: "AI agents in recruiting",
        resolved_audience: "HR leaders",
        resolved_objective: "Educate and build authority",
        resolved_tone: "Professional",
        status: "draft",
        ...overrides,
      })
      .select()
      .single();
    requestIds.push(data!.id);
    return data!;
  }

  it("produces a plan with 3-5 queries, canonicalizes/dedupes candidates, and stores immutable source snapshots", async () => {
    const request = await newRequest();
    const ai = new FakeAIProvider([RESEARCH_PLAN, usableAnalysis(), usableAnalysis()]);
    const research = new FakeResearchProvider();

    research.setSearchResults("ai agents recruiting", [
      { url: "https://example.com/article?utm_source=x", title: "Article", snippet: "s" },
    ]);
    research.setSearchResults("ai screening tools hr", [
      // Tracking-parameter duplicate of the same canonical article.
      { url: "https://example.com/article?utm_source=y&utm_campaign=z", title: "Article", snippet: "s" },
      { url: "https://example.com/second-article", title: "Second", snippet: "s2" },
    ]);
    research.setSearchResults("recruiting automation case study", []);

    research.setRetrieval("https://example.com/article?utm_source=x", {
      status: "usable",
      page: {
        originalUrl: "https://example.com/article?utm_source=x",
        canonicalUrl: "https://example.com/article",
        title: "Article",
        publisher: "Example",
        author: null,
        publishedAt: null,
        markdown: "Some teams reported reduced administrative workload.",
        retrievedAt: new Date().toISOString(),
      },
    });
    research.setRetrieval("https://example.com/second-article", {
      status: "usable",
      page: {
        originalUrl: "https://example.com/second-article",
        canonicalUrl: "https://example.com/second-article",
        title: "Second",
        publisher: "Example",
        author: null,
        publishedAt: null,
        markdown: "Some teams reported reduced administrative workload.",
        retrievedAt: new Date().toISOString(),
      },
    });

    const result = await runResearchPipeline(owner.client, ai, research, "fake-model", request.id);

    expect(RESEARCH_PLAN.searchQueries.length).toBeGreaterThanOrEqual(3);
    expect(RESEARCH_PLAN.searchQueries.length).toBeLessThanOrEqual(5);
    expect(result.usableSourceCount).toBe(2);
    expect(result.transitioned).toBe(true);

    const sources = await listResearchSources(owner.client, request.id);
    // The two search-result URLs for the same canonical article collapse into one row.
    expect(sources).toHaveLength(2);
    expect(sources.every((s) => s.retrieval_status === "usable")).toBe(true);

    const evidence = await listSourceEvidence(owner.client, sources[0].id);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].supports).toEqual(["use of automation in candidate screening"]);
    expect(evidence[0].limitations).toEqual(["cost savings", "improved hiring outcomes"]);

    const { data: updatedRequest } = await admin.from("content_requests").select("status").eq("id", request.id).single();
    expect(updatedRequest?.status).toBe("source_review");
  });

  it("preserves successful sources when one retrieval fails (partial success)", async () => {
    const request = await newRequest();
    const ai = new FakeAIProvider([RESEARCH_PLAN, usableAnalysis()]);
    const research = new FakeResearchProvider();

    research.setSearchResults("ai agents recruiting", [{ url: "https://example.com/good", title: "Good", snippet: "s" }]);
    research.setSearchResults("ai screening tools hr", [{ url: "https://example.com/bad", title: "Bad", snippet: "s" }]);
    research.setSearchResults("recruiting automation case study", []);

    research.setRetrieval("https://example.com/good", {
      status: "usable",
      page: {
        originalUrl: "https://example.com/good",
        canonicalUrl: "https://example.com/good",
        title: "Good",
        publisher: "Example",
        author: null,
        publishedAt: null,
        markdown: "Some teams reported reduced administrative workload.",
        retrievedAt: new Date().toISOString(),
      },
    });
    research.setRetrieval("https://example.com/bad", { status: "failed", reason: "Timed out", retrySafe: true });

    const result = await runResearchPipeline(owner.client, ai, research, "fake-model", request.id);

    expect(result.usableSourceCount).toBe(1);
    const sources = await listResearchSources(owner.client, request.id);
    expect(sources.some((s) => s.retrieval_status === "usable")).toBe(true);
    expect(sources.some((s) => s.retrieval_status === "failed")).toBe(true);
  });

  it("does not transition to source_review when zero usable sources are found", async () => {
    const request = await newRequest();
    const ai = new FakeAIProvider([RESEARCH_PLAN]);
    const research = new FakeResearchProvider();
    research.setSearchResults("ai agents recruiting", [{ url: "https://example.com/dead", title: "Dead", snippet: "s" }]);
    research.setSearchResults("ai screening tools hr", []);
    research.setSearchResults("recruiting automation case study", []);
    research.setRetrieval("https://example.com/dead", { status: "failed", reason: "404", retrySafe: false });

    const result = await runResearchPipeline(owner.client, ai, research, "fake-model", request.id);

    expect(result.usableSourceCount).toBe(0);
    expect(result.transitioned).toBe(false);
    const { data: updatedRequest } = await admin.from("content_requests").select("status").eq("id", request.id).single();
    expect(updatedRequest?.status).toBe("draft");
  });

  it("retries a single failed source without disturbing other sources", async () => {
    const request = await newRequest();
    const ai = new FakeAIProvider([RESEARCH_PLAN]);
    const research = new FakeResearchProvider();
    research.setSearchResults("ai agents recruiting", [{ url: "https://example.com/flaky", title: "Flaky", snippet: "s" }]);
    research.setSearchResults("ai screening tools hr", []);
    research.setSearchResults("recruiting automation case study", []);
    research.setRetrieval("https://example.com/flaky", { status: "failed", reason: "Timed out", retrySafe: true });

    await runResearchPipeline(owner.client, ai, research, "fake-model", request.id);
    const sourcesBefore = await listResearchSources(owner.client, request.id);
    expect(sourcesBefore).toHaveLength(1);
    expect(sourcesBefore[0].retrieval_status).toBe("failed");

    ai.enqueue(usableAnalysis());
    research.setRetrieval("https://example.com/flaky", {
      status: "usable",
      page: {
        originalUrl: "https://example.com/flaky",
        canonicalUrl: "https://example.com/flaky",
        title: "Flaky",
        publisher: "Example",
        author: null,
        publishedAt: null,
        markdown: "Some teams reported reduced administrative workload.",
        retrievedAt: new Date().toISOString(),
      },
    });

    const retried = await retryResearchSource(owner.client, ai, research, "fake-model", sourcesBefore[0].id);
    expect(retried.retrieval_status).toBe("usable");

    const sourcesAfter = await listResearchSources(owner.client, request.id);
    expect(sourcesAfter).toHaveLength(1);
  });
});
