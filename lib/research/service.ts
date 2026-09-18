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
import {
  createResearchSource,
  updateResearchSource,
  createSourceEvidence,
  getResearchSource,
  listResearchSources,
  confirmSourceSet,
} from "@/lib/repositories/sources";
import { assessKeywordCoverage, type KeywordCoverage } from "@/lib/research/keyword-coverage";
import { textCoversKeyword } from "@/lib/domain/keyword";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type ResearchSourceRow = Database["public"]["Tables"]["research_sources"]["Row"];
type SourceSetVersionRow = Database["public"]["Tables"]["source_set_versions"]["Row"];

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
      return updateResearchSource(supabase, sourceRow.id, {
        retrieval_status: "unusable",
        recommendation: "exclude",
        recommendation_reason: analysis.recommendationReason,
      });
    }

    await updateResearchSource(supabase, sourceRow.id, {
      recommendation: analysis.recommendation,
      recommendation_reason: analysis.recommendationReason,
    });

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

  // The keyword the rest of the pipeline works from, and the one this run
  // actually searched for. They are the same value, stored separately: the
  // first is editable, and comparing them is what tells the Research tab
  // whether re-running would do anything.
  const researchedKeyword = request.resolved_primary_keyword ?? plan.primaryKeyword;
  await admin
    .from("content_requests")
    .update({ resolved_primary_keyword: researchedKeyword, researched_keyword: researchedKeyword })
    .eq("id", requestId);

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
  // Materials and URLs supplied at intake already exist as `pending`
  // sources. They are picked up here, so one "Start research" covers
  // everything attached to the request — before, a supplied URL sat
  // untouched until someone found and started it one source at a time.
  const allSources = await listResearchSources(supabase, requestId);
  const pendingSupplied = allSources.filter((source) => source.retrieval_status === "pending" && source.origin !== "researched");

  const candidates: Array<SearchResultItem & { origin: "researched" | "user_url"; existingSourceId?: string }> = [];

  // Listed first so that dedupe keeps the existing row and updates it in
  // place, rather than creating a second source for the same URL.
  for (const source of pendingSupplied) {
    if (source.origin !== "user_url" || !source.original_url) continue;
    candidates.push({ url: source.original_url, title: null, snippet: null, origin: "user_url", existingSourceId: source.id });
  }

  candidates.push(...searchResultsByQuery.flat().map((r) => ({ ...r, origin: "researched" as const })));

  const canonicalized = candidates
    .map((c) => {
      try {
        return { ...c, canonicalUrl: canonicalizeUrl(c.url) };
      } catch {
        return null;
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // A re-run must be additive: sources already retrieved keep whatever
  // decision has been made about them, and only genuinely new URLs are
  // fetched. Without this, re-running after a keyword change would create
  // a second row for every page the first run already found.
  const alreadyKnown = new Set(
    allSources.map((source) => source.canonical_url ?? source.original_url).filter((url): url is string => Boolean(url))
  );

  const deduped = dedupeByCanonicalUrl(canonicalized)
    .filter((candidate) => candidate.existingSourceId || !alreadyKnown.has(candidate.canonicalUrl))
    .slice(0, MAX_CANDIDATES_ATTEMPTED);

  const processedSources: ResearchSourceRow[] = await mapWithConcurrency(deduped, RETRIEVAL_CONCURRENCY, (candidate) =>
    retrieveAndAnalyze(
      supabase,
      ai,
      research,
      modelId,
      request,
      plan.researchQuestions,
      candidate.origin,
      candidate.url,
      candidate.canonicalUrl,
      candidate.existingSourceId
    )
  );

  // Uploaded files have nothing to retrieve — their text was extracted at
  // upload — so they run the evidence analysis directly.
  const analyzedMaterials = await mapWithConcurrency(
    pendingSupplied.filter((source) => source.origin === "uploaded_material"),
    RETRIEVAL_CONCURRENCY,
    (source) => analyzeUploadedMaterialSource(supabase, ai, modelId, source.id).catch(() => source)
  );
  processedSources.push(...analyzedMaterials);

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

  // Checked here rather than after the source decisions, so it is recorded
  // while the sources are still on screen —
  // the last point where changing the keyword or adding one source is
  // cheap. It never stops the pipeline: the sources are real and the
  // request should still reach source review, where the gap is shown and
  // confirming is what gets blocked.
  if (usableSourceCount > 0) {
    const coverage = await assessRequestKeywordCoverage(supabase, requestId);
    // Recorded, not notified: working by hand you are already looking at
    // the Research tab, where the banner says this. Auto mode notifies,
    // because nobody is watching it.
    if (coverage.assessed && !coverage.covered && coverage.keyword) {
      await recordActivityEvent({
        requestId,
        eventType: "keyword_coverage_gap",
        message: `No usable source mentions the primary keyword "${coverage.keyword}"`,
        actorId: request.owner_id,
      });
    }
  }

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

/**
 * Assesses the request's keyword coverage against the evidence that will
 * actually inform the article.
 *
 * Which sources count depends on where the request is. Before the source
 * set is confirmed, every usable source is still a candidate; once
 * decisions exist, only the accepted ones matter — excluding the one
 * source that mentioned the keyword is exactly the case worth catching.
 */
export async function assessRequestKeywordCoverage(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<KeywordCoverage> {
  const request = await getRequestOrThrow(supabase, requestId);

  const { data: sources, error } = await supabase
    .from("research_sources")
    .select("id, title, extracted_text, origin, retrieval_status")
    .eq("request_id", requestId)
    .eq("retrieval_status", "usable");
  if (error) throw error;

  const usable = sources ?? [];
  if (usable.length === 0) return assessKeywordCoverage(request.resolved_primary_keyword, []);

  const { data: decisions, error: decisionError } = await supabase
    .from("source_review_decisions")
    .select("source_id, decision, created_at")
    .in(
      "source_id",
      usable.map((s) => s.id)
    )
    .order("created_at", { ascending: false });
  if (decisionError) throw decisionError;

  // Newest first, so the first row seen for a source is its latest decision.
  const latestDecision = new Map<string, string>();
  for (const row of decisions ?? []) {
    if (!latestDecision.has(row.source_id)) latestDecision.set(row.source_id, row.decision);
  }

  const considered = latestDecision.size === 0 ? usable : usable.filter((s) => latestDecision.get(s.id) === "accepted");

  return assessKeywordCoverage(
    request.resolved_primary_keyword,
    considered.map((s) => ({
      id: s.id,
      title: s.title,
      extractedText: s.extracted_text,
      origin: s.origin as "researched" | "user_url" | "uploaded_material",
    }))
  );
}

/**
 * Confirms the reviewed source set, refusing when the accepted evidence
 * does not cover the request's primary keyword.
 *
 * The gate lives here rather than in the `confirm_source_set` RPC because
 * it is a content-quality rule, not an authorization one — the same
 * division the deterministic SEO checks already follow. The RPC keeps
 * enforcing who may confirm and in what state.
 *
 * It only ever refuses on sources the system found for itself. Material
 * the user supplied is their call: they know why it is relevant, and
 * blocking on it would turn a safeguard into an obstacle.
 */
export async function confirmReviewedSourceSet(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<SourceSetVersionRow> {
  const coverage = await assessRequestKeywordCoverage(supabase, requestId);
  if (coverage.blocking) {
    throw new DomainError("VALIDATION_ERROR", "confirm_source_set", coverage.message);
  }
  return confirmSourceSet(supabase, requestId);
}

export type ResearchRunAvailability =
  | { canRun: true; kind: "initial" | "rerun" }
  /** `reason` explains at length; `hint` is the few words that sit beside the disabled button. */
  | { canRun: false; reason: string; hint: string };

/**
 * Whether research can be started or started again, and why not.
 *
 * Research used to be a once-only act: the action refused unless the
 * request was still a draft, and running it is what ends draft. That left
 * a dead end — change the keyword afterwards and the sources stay whatever
 * the first run found, with nothing to do about it.
 *
 * A re-run is offered only when the keyword has actually changed, because
 * re-running the same searches mostly re-fetches the same pages and
 * spends a pipeline to do it. It stops being offered once the source set
 * is confirmed: from that point the confirmed set is what the plan and
 * article are built on, and replacing the evidence underneath finished
 * work is a different operation from gathering it.
 */
export function researchRunAvailability(request: {
  status: string;
  resolved_primary_keyword: string | null;
  researched_keyword: string | null;
  deleted_at?: string | null;
}): ResearchRunAvailability {
  if (request.deleted_at) {
    return {
      canRun: false,
      reason: "This request is in the bin. Restore it before researching.",
      hint: "Restore this request first",
    };
  }

  if (request.status === "draft") return { canRun: true, kind: "initial" };

  if (request.status !== "source_review") {
    return {
      canRun: false,
      reason: "The source set is confirmed, so research is settled for this request. Add a URL to bring in anything it missed.",
      hint: "Source set confirmed — add a URL to bring in anything missed",
    };
  }

  const current = request.resolved_primary_keyword?.trim() ?? "";
  const researched = request.researched_keyword?.trim() ?? "";

  if (current && researched && !textCoversKeyword(current, researched) && !textCoversKeyword(researched, current)) {
    return { canRun: true, kind: "rerun" };
  }

  return {
    canRun: false,
    reason: `Research already ran for "${researched || current}". Change the primary keyword to search for something different.`,
    hint: "Edit the keyword to run more searches",
  };
}
