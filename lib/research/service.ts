import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DomainError, getErrorMessage } from "@/lib/domain/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AIProvider } from "@/lib/ai/types";
import type { ResearchProvider, SearchResultItem } from "@/lib/research/types";
import { createResearchPlan } from "@/lib/ai/service";
import { analyzeSource } from "@/lib/ai/service";
import { canonicalizeUrl, dedupeByCanonicalUrl, parseUserSuppliedUrl } from "@/lib/research/url";
import { createOperationRun, updateOperationRun } from "@/lib/repositories/operations";
import { recordActivityEvent } from "@/lib/repositories/activity";
import { createResearchSource, updateResearchSource, createSourceEvidence, getResearchSource } from "@/lib/repositories/sources";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];

const MAX_SEARCH_RESULTS_PER_QUERY = 5;
const MAX_USABLE_SOURCES = 8;
const MAX_CANDIDATES_ATTEMPTED = 12;
const RETRIEVAL_CONCURRENCY = 4;
const SEARCH_CONCURRENCY = 3;

/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Retrieval
 * and source analysis are independent per candidate, so running them
 * sequentially made an 8-source research run take 4+ minutes wall clock in
 * manual verification (each source analysis call takes 15-50s) — a real
 * risk for both UX and serverless request timeouts. Bounded concurrency
 * keeps wall-clock time reasonable without firing every request at once
 * against provider rate limits.
 */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function getRequestOrThrow(supabase: SupabaseClient<Database>, requestId: string): Promise<ContentRequestRow> {
  const { data, error } = await supabase.from("content_requests").select().eq("id", requestId).single();
  if (error || !data) throw error ?? new DomainError("NOT_FOUND", "research_pipeline", "Request not found.");
  return data;
}

/**
 * One usable source's retrieve -> persist -> analyze -> persist-evidence
 * sequence, shared by the main pipeline and the single-source retry path.
 * A source that retrieves as usable but whose analysis call fails keeps its
 * `usable` retrieval status with no evidence rows rather than being
 * dropped — the Source Review UI can still show it and the Content
 * Manager can exclude it manually.
 */
async function retrieveAndAnalyze(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  research: ResearchProvider,
  modelId: string,
  request: ContentRequestRow,
  researchQuestions: string[],
  origin: "researched" | "user_url",
  originalUrl: string,
  canonicalUrl: string,
  existingSourceId?: string
): Promise<ResearchSourceRow> {
  const outcome = await research.retrieve(originalUrl);

  if (outcome.status === "failed") {
    const patch = {
      request_id: request.id,
      origin,
      original_url: originalUrl,
      canonical_url: canonicalUrl,
      retrieval_status: "failed" as const,
      retrieval_error: outcome.reason,
    };
    return existingSourceId
      ? updateResearchSource(supabase, existingSourceId, patch)
      : createResearchSource(supabase, patch);
  }

  const page = outcome.page;
  const basePatch = {
    request_id: request.id,
    origin,
    original_url: page.originalUrl,
    canonical_url: page.canonicalUrl,
    title: page.title,
    publisher: page.publisher,
    author: page.author,
    published_at: page.publishedAt,
    retrieved_at: page.retrievedAt,
    extracted_text: page.markdown,
    retrieval_error: null,
  };

  if (outcome.status === "unusable") {
    const patch = { ...basePatch, retrieval_status: "unusable" as const };
    return existingSourceId
      ? updateResearchSource(supabase, existingSourceId, patch)
      : createResearchSource(supabase, patch);
  }

  const sourceRow = existingSourceId
    ? await updateResearchSource(supabase, existingSourceId, { ...basePatch, retrieval_status: "usable" })
    : await createResearchSource(supabase, { ...basePatch, retrieval_status: "usable" });

  return analyzeAndStoreEvidence(supabase, ai, modelId, request, sourceRow, page.markdown, researchQuestions);
}

/**
 * Shared AI-analysis + evidence-persistence tail (SYSTEM-DESIGN-NEXTJS.md
 * §9.4, §11): once a source has real text — whether retrieved from a URL
 * or already extracted from an uploaded file — the rest of the journey
 * (analyze, store evidence, or mark unusable) is identical.
 */
async function analyzeAndStoreEvidence(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  request: ContentRequestRow,
  sourceRow: ResearchSourceRow,
  rawText: string,
  researchQuestions: string[]
): Promise<ResearchSourceRow> {
  const analysisRun = await createOperationRun(supabase, {
    request_id: request.id,
    operation_type: "source_analysis",
    status: "running",
    model: modelId,
    started_at: new Date().toISOString(),
  });

  try {
    const analysis = await analyzeSource(ai, modelId, {
      topic: request.topic,
      researchQuestions,
      sourceLabel: sourceRow.id,
      rawText,
    });
    await updateOperationRun(supabase, analysisRun.id, { status: "succeeded", finished_at: new Date().toISOString() });

    if (!analysis.isUsable || analysis.evidence.length === 0) {
      return updateResearchSource(supabase, sourceRow.id, { retrieval_status: "unusable" });
    }

    for (const item of analysis.evidence) {
      await createSourceEvidence(supabase, {
        source_id: sourceRow.id,
        evidence_key: item.evidenceKey,
        excerpt: item.excerpt,
        conservative_summary: item.conservativeSummary,
        supports: item.supports,
        limitations: item.doesNotEstablish,
        source_analysis_run_id: analysisRun.id,
      });
    }
    return sourceRow;
  } catch (error) {
    await updateOperationRun(supabase, analysisRun.id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: getErrorMessage(error),
    });
    return sourceRow;
  }
}

export interface ResearchPipelineResult {
  usableSourceCount: number;
  transitioned: boolean;
}

/**
 * Research -> Search -> Retrieval -> Evidence Analysis pipeline
 * (SYSTEM-DESIGN-NEXTJS.md §9). A downstream failure never destroys valid
 * completed upstream work: one failed source does not erase successful
 * ones, and the request only advances to `source_review` once at least one
 * usable source has been persisted.
 */
export async function runResearchPipeline(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  research: ResearchProvider,
  modelId: string,
  requestId: string
): Promise<ResearchPipelineResult> {
  const request = await getRequestOrThrow(supabase, requestId);

  const planRun = await createOperationRun(supabase, {
    request_id: requestId,
    operation_type: "research_planning",
    status: "running",
    model: modelId,
    started_at: new Date().toISOString(),
  });

  const plan = await createResearchPlan(ai, modelId, {
    topic: request.topic,
    audience: request.resolved_audience,
    objective: request.resolved_objective,
    tone: request.resolved_tone,
    primaryKeyword: request.resolved_primary_keyword,
    additionalInstructions: request.additional_instructions,
  }).catch(async (error) => {
    await updateOperationRun(supabase, planRun.id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: getErrorMessage(error),
    });
    throw error;
  });

  await updateOperationRun(supabase, planRun.id, { status: "succeeded", finished_at: new Date().toISOString() });
  await recordActivityEvent({
    requestId,
    eventType: "research_plan_created",
    message: `Research plan created (${plan.searchQueries.length} search queries)`,
    actorId: request.owner_id,
  });

  // content_requests has no client UPDATE policy (see tests/integration/auth-permissions.test.ts):
  // all mutations either go through a security-definer RPC or, for research-pipeline
  // progress writes like these, through trusted server code using the admin client,
  // matching the existing pattern for activity_events (lib/repositories/activity.ts).
  const admin = createSupabaseAdminClient();

  if (!request.resolved_primary_keyword && plan.primaryKeyword) {
    await admin.from("content_requests").update({ resolved_primary_keyword: plan.primaryKeyword }).eq("id", requestId);
  }

  // "Only use supplied materials" (Phase 1 intake option): skip AI-generated
  // web search entirely rather than merely excluding its results, since the
  // whole point is to never issue an external search for this request.
  const searchResultsByQuery = request.supplied_sources_only
    ? []
    : await mapWithConcurrency(plan.searchQueries, SEARCH_CONCURRENCY, async (query) => {
        try {
          return await research.search(query, MAX_SEARCH_RESULTS_PER_QUERY);
        } catch {
          // A single failed search query is non-fatal; continue with the rest.
          return [];
        }
      });
  const candidates: Array<SearchResultItem & { origin: "researched" | "user_url" }> = searchResultsByQuery
    .flat()
    .map((r) => ({ ...r, origin: "researched" as const }));

  const userUrls = Array.isArray(request.source_urls) ? (request.source_urls as unknown as string[]) : [];
  for (const url of userUrls) {
    candidates.push({ url, title: null, snippet: null, origin: "user_url" });
  }

  const canonicalized = candidates
    .map((c) => {
      try {
        return { ...c, canonicalUrl: canonicalizeUrl(c.url) };
      } catch {
        return null;
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const deduped = dedupeByCanonicalUrl(canonicalized).slice(0, MAX_CANDIDATES_ATTEMPTED);

  const processedSources = await mapWithConcurrency(deduped, RETRIEVAL_CONCURRENCY, (candidate) =>
    retrieveAndAnalyze(
      supabase,
      ai,
      research,
      modelId,
      request,
      plan.researchQuestions,
      candidate.origin,
      candidate.url,
      candidate.canonicalUrl
    )
  );

  const usableSourceCount = Math.min(
    processedSources.filter((source) => source.retrieval_status === "usable").length,
    MAX_USABLE_SOURCES
  );

  await recordActivityEvent({
    requestId,
    eventType: "research_retrieval_completed",
    message:
      usableSourceCount > 0
        ? `${usableSourceCount} usable source${usableSourceCount === 1 ? "" : "s"} found`
        : "No usable sources found",
    actorId: request.owner_id,
  });

  let transitioned = false;
  if (usableSourceCount > 0 && request.status === "draft") {
    await admin.from("content_requests").update({ status: "source_review" }).eq("id", requestId);
    await recordActivityEvent({
      requestId,
      eventType: "ready_for_source_review",
      message: "Ready for Source Review",
      actorId: request.owner_id,
    });
    transitioned = true;
  }

  return { usableSourceCount, transitioned };
}

/**
 * Retries retrieval (and analysis, if retrieval succeeds) for one existing
 * source in place, without disturbing any other source
 * (SYSTEM-DESIGN-NEXTJS.md §10.1 "Retry failed source").
 */
export async function retryResearchSource(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  research: ResearchProvider,
  modelId: string,
  sourceId: string
): Promise<ResearchSourceRow> {
  const existing = await getResearchSource(supabase, sourceId);
  if (!existing) throw new DomainError("NOT_FOUND", "research_retry", "Source not found.");
  if (existing.origin === "uploaded_material") {
    throw new DomainError("VALIDATION_ERROR", "research_retry", "Use analyzeUploadedMaterialSource for an uploaded-material source.");
  }

  const request = await getRequestOrThrow(supabase, existing.request_id);

  const result = await retrieveAndAnalyze(
    supabase,
    ai,
    research,
    modelId,
    request,
    [],
    existing.origin as "researched" | "user_url",
    existing.original_url ?? "",
    existing.canonical_url ?? existing.original_url ?? "",
    existing.id
  );

  await transitionToSourceReviewIfNeeded(supabase, request, result);

  return result;
}

async function transitionToSourceReviewIfNeeded(
  supabase: SupabaseClient<Database>,
  request: ContentRequestRow,
  result: ResearchSourceRow
): Promise<void> {
  if (result.retrieval_status === "usable" && request.status === "draft") {
    const admin = createSupabaseAdminClient();
    await admin.from("content_requests").update({ status: "source_review" }).eq("id", request.id);
  }
}

/**
 * Adds one supplementary URL as a `pending` source — no retrieval happens
 * yet (SYSTEM-DESIGN-NEXTJS.md §10, Phase 2 of the post-Task-22 UX pass).
 * Lets a Content Manager queue up a URL to research individually, either
 * before the first "Start research" run or after it, without forcing an
 * immediate retrieval attempt.
 */
export async function addPendingSourceUrl(
  supabase: SupabaseClient<Database>,
  requestId: string,
  url: string
): Promise<ResearchSourceRow> {
  const normalizedUrl = parseUserSuppliedUrl(url);
  if (!normalizedUrl) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "add_source_url",
      "That does not look like a web address. Paste a full link, for example https://example.com/article."
    );
  }
  const canonicalUrl = canonicalizeUrl(normalizedUrl);

  const { data: existingSources, error } = await supabase
    .from("research_sources")
    .select("id")
    .eq("request_id", requestId)
    .eq("canonical_url", canonicalUrl);
  if (error) throw error;
  if ((existingSources ?? []).length > 0) {
    throw new DomainError("VALIDATION_ERROR", "add_source_url", "This URL has already been added to this request.");
  }

  return createResearchSource(supabase, {
    request_id: requestId,
    origin: "user_url",
    original_url: normalizedUrl,
    canonical_url: canonicalUrl,
    retrieval_status: "pending",
  });
}

/**
 * Runs the same AI evidence analysis a retrieved URL gets, but for a
 * supporting material whose text was already extracted at upload time
 * (SYSTEM-DESIGN-NEXTJS.md §11) — no retrieval step, since there is
 * nothing to fetch.
 */
export async function analyzeUploadedMaterialSource(
  supabase: SupabaseClient<Database>,
  ai: AIProvider,
  modelId: string,
  sourceId: string
): Promise<ResearchSourceRow> {
  const existing = await getResearchSource(supabase, sourceId);
  if (!existing) throw new DomainError("NOT_FOUND", "material_analysis", "Source not found.");
  if (existing.origin !== "uploaded_material" || !existing.supporting_material_id) {
    throw new DomainError("VALIDATION_ERROR", "material_analysis", "This source is not backed by an uploaded material.");
  }

  const request = await getRequestOrThrow(supabase, existing.request_id);

  const { data: material, error } = await supabase
    .from("supporting_materials")
    .select("extracted_text, extraction_status")
    .eq("id", existing.supporting_material_id)
    .single();
  if (error || !material) throw error ?? new DomainError("NOT_FOUND", "material_analysis", "Supporting material not found.");
  if (material.extraction_status !== "ready" || !material.extracted_text) {
    throw new DomainError("VALIDATION_ERROR", "material_analysis", "This material's text could not be extracted, so it cannot be analyzed.");
  }

  // analyzeAndStoreEvidence's success path returns its sourceRow argument
  // as-is (retrieveAndAnalyze's caller already flips a URL source to
  // `usable` before calling it) — a material source has no such prior
  // step, so it must be marked `usable` here first, or a successful
  // analysis would silently leave the row `pending` forever.
  const usableSource = await updateResearchSource(supabase, existing.id, {
    retrieval_status: "usable",
    extracted_text: material.extracted_text,
  });

  const result = await analyzeAndStoreEvidence(supabase, ai, modelId, request, usableSource, material.extracted_text, []);
  await transitionToSourceReviewIfNeeded(supabase, request, result);
  return result;
}
